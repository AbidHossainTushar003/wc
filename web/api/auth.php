<?php
/**
 * Authentication API Endpoint
 * Handles admin sign-in and customer sign-in / registration.
 */

require_once __DIR__ . '/db.php';

$pdo = Database::getConnection();

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

$data = getRequestBody();
$action = $_GET['action'] ?? ($data['action'] ?? 'login');

switch ($action) {
    case 'admin_login':
        $username = is_string($data['username'] ?? null) ? trim($data['username']) : '';
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        if ($username === '' || $password === '') {
            jsonResponse(['error' => 'Please enter username and password'], 400);
        }

        if (isLoginRateLimited($pdo)) {
            header('Retry-After: 900');
            jsonResponse(['error' => 'Too many login attempts. Try again in 15 minutes.'], 429);
        }

        $stmt = $pdo->prepare('SELECT * FROM admins WHERE username = ?');
        $stmt->execute([$username]);
        $admin = $stmt->fetch();
        if (!$admin || !password_verify($password, $admin['password_hash'])) {
            if (recordLoginFailure($pdo)) {
                header('Retry-After: 900');
                jsonResponse(['error' => 'Too many login attempts. Try again in 15 minutes.'], 429);
            }
            jsonResponse(['error' => 'Invalid admin credentials'], 401);
        }

        clearLoginAttempts($pdo);
        if (password_needs_rehash($admin['password_hash'], PASSWORD_DEFAULT)) {
            $rehash = $pdo->prepare('UPDATE admins SET password_hash = ? WHERE id = ?');
            $rehash->execute([password_hash($password, PASSWORD_DEFAULT), (int)$admin['id']]);
        }

        $token = 'wc_adm_' . bin2hex(random_bytes(32));
        $expiresAt = gmdate('Y-m-d H:i:s', time() + 43200);
        $pdo->prepare('DELETE FROM admin_tokens WHERE expires_at <= ?')->execute([gmdate('Y-m-d H:i:s')]);
        $tokenStmt = $pdo->prepare('INSERT INTO admin_tokens (token_hash, admin_id, expires_at) VALUES (?, ?, ?)');
        $tokenStmt->execute([hash('sha256', $token), (int)$admin['id'], $expiresAt]);

        jsonResponse([
            'status' => 'success',
            'message' => 'Admin login successful',
            'data' => [
                'token' => $token,
                'expires_at' => $expiresAt,
                'admin_id' => $admin['id'],
                'username' => $admin['username'],
                'full_name' => $admin['full_name'],
                'role' => $admin['role']
            ]
        ]);
        break;

    case 'admin_change_password':
        $admin = requireAdminToken($pdo);
        $currentPassword = is_string($data['current_password'] ?? null) ? $data['current_password'] : '';
        $newPassword = is_string($data['new_password'] ?? null) ? $data['new_password'] : '';
        if ($currentPassword === '' || strlen($newPassword) < 14 || strlen($newPassword) > 72) {
            jsonResponse(['error' => 'Enter your current password and a new password between 14 and 72 characters.'], 422);
        }

        $adminStmt = $pdo->prepare('SELECT password_hash FROM admins WHERE id = ?');
        $adminStmt->execute([(int)$admin['id']]);
        $passwordHash = $adminStmt->fetchColumn();
        if (!$passwordHash || !password_verify($currentPassword, $passwordHash)) {
            jsonResponse(['error' => 'Current password is incorrect.'], 401);
        }
        if (password_verify($newPassword, $passwordHash)) {
            jsonResponse(['error' => 'Choose a password you have not used before.'], 422);
        }

        $token = 'wc_adm_' . bin2hex(random_bytes(32));
        $expiresAt = gmdate('Y-m-d H:i:s', time() + 43200);
        try {
            $pdo->beginTransaction();
            $updatePassword = $pdo->prepare('UPDATE admins SET password_hash = ? WHERE id = ?');
            $updatePassword->execute([password_hash($newPassword, PASSWORD_DEFAULT), (int)$admin['id']]);
            $revokeTokens = $pdo->prepare('DELETE FROM admin_tokens WHERE admin_id = ?');
            $revokeTokens->execute([(int)$admin['id']]);
            $newToken = $pdo->prepare('INSERT INTO admin_tokens (token_hash, admin_id, expires_at) VALUES (?, ?, ?)');
            $newToken->execute([hash('sha256', $token), (int)$admin['id'], $expiresAt]);
            $pdo->commit();
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Wonderful Collection admin password update failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not update the admin password. Please try again.'], 500);
        }

        jsonResponse([
            'status' => 'success',
            'message' => 'Admin password updated.',
            'data' => ['token' => $token, 'expires_at' => $expiresAt]
        ]);
        break;

    case 'admin_logout':
        requireAdminToken($pdo);
        $token = getAdminTokenFromRequest();
        $stmt = $pdo->prepare('DELETE FROM admin_tokens WHERE token_hash = ?');
        $stmt->execute([hash('sha256', $token)]);
        jsonResponse(['status' => 'success', 'message' => 'Admin logged out']);
        break;

    case 'register':
        $name = trim(is_string($data['name'] ?? null) ? $data['name'] : '');
        $email = trim(is_string($data['email'] ?? null) ? $data['email'] : '');
        $phone = trim(is_string($data['phone'] ?? null) ? $data['phone'] : '');
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        $address = trim(is_string($data['address'] ?? null) ? $data['address'] : '');
        $area = trim(is_string($data['area'] ?? null) ? $data['area'] : 'Dhanmondi');

        if ($name === '' || $email === '' || $phone === '' || $password === '') {
            jsonResponse(['error' => 'Name, email, phone, and password are required'], 422);
        }
        if (strlen($password) < 8 || strlen($password) > 72) {
            jsonResponse(['error' => 'Password must be between 8 and 72 characters'], 422);
        }

        $check = $pdo->prepare('SELECT id FROM customers WHERE email = ?');
        $check->execute([$email]);
        if ($check->fetch()) {
            jsonResponse(['error' => 'An account with this email already exists'], 409);
        }

        $passHash = password_hash($password, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("
            INSERT INTO customers (name, email, phone, password_hash, address, area, city)
            VALUES (?, ?, ?, ?, ?, ?, 'Dhaka')
        ");
        $stmt->execute([$name, $email, $phone, $passHash, $address, $area]);
        $custId = $pdo->lastInsertId();

        jsonResponse([
            'status' => 'success',
            'message' => 'Account created successfully!',
            'data' => [
                'customer_id' => $custId,
                'name' => $name,
                'email' => $email,
                'phone' => $phone,
                'address' => $address,
                'area' => $area,
                'token' => 'wc_usr_' . bin2hex(random_bytes(16))
            ]
        ], 201);
        break;

    case 'login':
    default:
        $email = is_string($data['email'] ?? null) ? trim($data['email']) : '';
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        if ($email === '' || $password === '') {
            jsonResponse(['error' => 'Email and password are required'], 400);
        }

        if (isLoginRateLimited($pdo)) {
            header('Retry-After: 900');
            jsonResponse(['error' => 'Too many login attempts. Try again in 15 minutes.'], 429);
        }

        $stmt = $pdo->prepare('SELECT * FROM customers WHERE email = ?');
        $stmt->execute([$email]);
        $customer = $stmt->fetch();
        if (!$customer || !password_verify($password, $customer['password_hash'])) {
            if (recordLoginFailure($pdo)) {
                header('Retry-After: 900');
                jsonResponse(['error' => 'Too many login attempts. Try again in 15 minutes.'], 429);
            }
            jsonResponse(['error' => 'Invalid email or password'], 401);
        }

        clearLoginAttempts($pdo);
        if (password_needs_rehash($customer['password_hash'], PASSWORD_DEFAULT)) {
            $rehash = $pdo->prepare('UPDATE customers SET password_hash = ? WHERE id = ?');
            $rehash->execute([password_hash($password, PASSWORD_DEFAULT), (int)$customer['id']]);
        }
        unset($customer['password_hash']);
        $customer['token'] = 'wc_usr_' . bin2hex(random_bytes(16));

        jsonResponse([
            'status' => 'success',
            'message' => 'Welcome back, ' . $customer['name'],
            'data' => $customer
        ]);
        break;
}
