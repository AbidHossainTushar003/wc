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

function createCustomerSession(PDO $pdo, int $customerId): array {
    $token = 'wc_usr_' . bin2hex(random_bytes(32));
    $expiresAt = gmdate('Y-m-d H:i:s', time() + 2592000);
    $pdo->prepare('DELETE FROM customer_tokens WHERE expires_at <= ?')->execute([gmdate('Y-m-d H:i:s')]);
    $stmt = $pdo->prepare('INSERT INTO customer_tokens (token_hash, customer_id, expires_at) VALUES (?, ?, ?)');
    $stmt->execute([hash('sha256', $token), $customerId, $expiresAt]);
    return ['token' => $token, 'expires_at' => $expiresAt];
}

function isAdminMfaConfigured(): bool {
    if (!defined('ADMIN_TOTP_SECRET')) {
        return false;
    }
    $secret = strtoupper(preg_replace('/[\s=-]/', '', (string)ADMIN_TOTP_SECRET));
    return preg_match('/\A[A-Z2-7]{16,128}\z/', $secret) === 1;
}

function verifyAdminTotp(string $code): ?int {
    if (!isAdminMfaConfigured() || !preg_match('/\A[0-9]{6}\z/', $code)) {
        return null;
    }

    $base32 = strtoupper(preg_replace('/[\s=-]/', '', (string)ADMIN_TOTP_SECRET));
    $alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    $secret = '';
    $buffer = 0;
    $bits = 0;
    foreach (str_split($base32) as $character) {
        $buffer = ($buffer << 5) | strpos($alphabet, $character);
        $bits += 5;
        if ($bits >= 8) {
            $bits -= 8;
            $secret .= chr(($buffer >> $bits) & 0xff);
            $buffer &= (1 << $bits) - 1;
        }
    }
    if ($secret === '') {
        return null;
    }

    $counter = intdiv(time(), 30);
    foreach ([-1, 0, 1] as $window) {
        $step = $counter + $window;
        $digest = hash_hmac('sha1', pack('N2', 0, $step), $secret, true);
        $offset = ord($digest[19]) & 0x0f;
        $binaryCode = ((ord($digest[$offset]) & 0x7f) << 24)
            | ((ord($digest[$offset + 1]) & 0xff) << 16)
            | ((ord($digest[$offset + 2]) & 0xff) << 8)
            | (ord($digest[$offset + 3]) & 0xff);
        $expected = str_pad((string)($binaryCode % 1000000), 6, '0', STR_PAD_LEFT);
        if (hash_equals($expected, $code)) {
            return $step;
        }
    }
    return null;
}

switch ($action) {
    case 'admin_login':
        $username = is_string($data['username'] ?? null) ? trim($data['username']) : '';
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        if ($username === '' || $password === '') {
            jsonResponse(['error' => 'Please enter username and password'], 400);
        }

        if (!isAdminMfaConfigured()) {
            logSecurityEvent('admin_mfa_unconfigured');
            jsonResponse(['error' => 'Admin sign-in is disabled until MFA is configured in api/config.local.php.'], 503);
        }
        if (isLoginRateLimited($pdo, $username)) {
            header('Retry-After: 900');
            jsonResponse(['error' => 'Too many login attempts. Try again in 15 minutes.'], 429);
        }

        $stmt = $pdo->prepare('SELECT * FROM admins WHERE username = ?');
        $stmt->execute([$username]);
        $admin = $stmt->fetch();
        if (!$admin || !password_verify($password, $admin['password_hash'])) {
            logSecurityEvent('admin_login_failed');
            if (recordLoginFailure($pdo, $username)) {
                header('Retry-After: 900');
                jsonResponse(['error' => 'Too many login attempts. Try again in 15 minutes.'], 429);
            }
            jsonResponse(['error' => 'Invalid admin credentials'], 401);
        }

        $totpCounter = verifyAdminTotp(is_string($data['totp_code'] ?? null) ? $data['totp_code'] : '');
        if ($totpCounter === null) {
            logSecurityEvent('admin_mfa_failed');
            if (recordLoginFailure($pdo, $username)) {
                header('Retry-After: 900');
                jsonResponse(['error' => 'Too many login attempts. Try again in 15 minutes.'], 429);
            }
            jsonResponse(['error' => 'Invalid admin credentials'], 401);
        }
        $consumeTotpCode = $pdo->prepare('
            UPDATE admins SET last_totp_counter = ?
            WHERE id = ? AND (last_totp_counter IS NULL OR last_totp_counter < ?)
        ');
        $consumeTotpCode->execute([$totpCounter, (int)$admin['id'], $totpCounter]);
        if ($consumeTotpCode->rowCount() !== 1) {
            logSecurityEvent('admin_mfa_replay_rejected');
            jsonResponse(['error' => 'Invalid admin credentials'], 401);
        }

        clearLoginAttempts($pdo, $username);
        if (password_needs_rehash($admin['password_hash'], PASSWORD_DEFAULT)) {
            $rehash = $pdo->prepare('UPDATE admins SET password_hash = ? WHERE id = ?');
            $rehash->execute([password_hash($password, PASSWORD_DEFAULT), (int)$admin['id']]);
        }

        $token = 'wc_adm_' . bin2hex(random_bytes(32));
        $passwordChangeRequired = (int)$admin['password_change_required'] === 1;
        $expiresAt = gmdate('Y-m-d H:i:s', time() + ($passwordChangeRequired ? 900 : 43200));
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
                'role' => $admin['role'],
                'must_change_password' => $passwordChangeRequired
            ]
        ]);
        break;

    case 'admin_change_password':
        $admin = requireAdminToken($pdo, true);
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
            $updatePassword = $pdo->prepare('UPDATE admins SET password_hash = ?, password_change_required = 0 WHERE id = ?');
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
        requireAdminToken($pdo, true);
        $token = getAdminTokenFromRequest();
        $stmt = $pdo->prepare('DELETE FROM admin_tokens WHERE token_hash = ?');
        $stmt->execute([hash('sha256', $token)]);
        jsonResponse(['status' => 'success', 'message' => 'Admin logged out']);
        break;

    case 'customer_logout':
        requireCustomerToken($pdo);
        $token = getBearerTokenFromRequest();
        $stmt = $pdo->prepare('DELETE FROM customer_tokens WHERE token_hash = ?');
        $stmt->execute([hash('sha256', $token)]);
        jsonResponse(['status' => 'success', 'message' => 'You have signed out.']);
        break;

    case 'customer_update_profile':
        $customer = requireCustomerToken($pdo);
        $name = trim(is_string($data['name'] ?? null) ? $data['name'] : '');
        $phone = trim(is_string($data['phone'] ?? null) ? $data['phone'] : '');
        $area = trim(is_string($data['area'] ?? null) ? $data['area'] : '');
        $address = trim(is_string($data['address'] ?? null) ? $data['address'] : '');
        if ($name === '' || strlen($name) > 150 || strlen($phone) > 30
            || strlen($area) > 100 || strlen($address) > 4000
            || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $name . $phone . $area . $address)
            || !preg_match('/^\+?[0-9][0-9\s()-]{6,28}$/', $phone)) {
            jsonResponse(['error' => 'Enter a valid name, phone number, area, and address.'], 422);
        }

        $updateProfile = $pdo->prepare('UPDATE customers SET name = ?, phone = ?, area = ?, address = ? WHERE id = ?');
        $updateProfile->execute([$name, $phone, $area, $address, (int)$customer['id']]);
        jsonResponse(['status' => 'success', 'message' => 'Profile updated successfully.']);
        break;

    case 'customer_delete_account':
        $customer = requireCustomerToken($pdo);
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        if ($password === '' || strlen($password) > 72) {
            jsonResponse(['error' => 'Enter your current password to delete this account.'], 422);
        }

        $passwordStmt = $pdo->prepare('SELECT password_hash FROM customers WHERE id = ?');
        $passwordStmt->execute([(int)$customer['id']]);
        $passwordHash = $passwordStmt->fetchColumn();
        if (!$passwordHash || !password_verify($password, $passwordHash)) {
            logSecurityEvent('customer_account_delete_denied');
            jsonResponse(['error' => 'Current password is incorrect.'], 401);
        }

        try {
            $pdo->beginTransaction();
            $anonymizeOrders = $pdo->prepare("
                UPDATE orders
                SET customer_id = NULL,
                    customer_name = 'Deleted customer',
                    customer_phone = '',
                    customer_email = NULL,
                    delivery_address = 'Deleted',
                    notes = NULL
                WHERE customer_id = ?
            ");
            $anonymizeOrders->execute([(int)$customer['id']]);
            $deleteCustomer = $pdo->prepare('DELETE FROM customers WHERE id = ?');
            $deleteCustomer->execute([(int)$customer['id']]);
            $pdo->commit();
            logSecurityEvent('customer_account_deleted');
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Wonderful Collection account deletion failed.');
            jsonResponse(['error' => 'Could not delete the account. Please try again.'], 500);
        }

        jsonResponse(['status' => 'success', 'message' => 'Your account has been deleted.']);
        break;

    case 'request_password_reset':
        enforceApiRateLimit($pdo, 'password_reset_request', 5, 3600);
        $email = trim(is_string($data['email'] ?? null) ? $data['email'] : '');
        if ($email === '' || strlen($email) > 150 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['error' => 'Enter a valid email address.'], 422);
        }

        $mailFrom = getMailFromAddress();
        if (!$mailFrom || !filter_var($mailFrom, FILTER_VALIDATE_EMAIL)) {
            logSecurityEvent('password_reset_mail_unconfigured');
            jsonResponse(['error' => 'Password reset is temporarily unavailable. Please contact store support.'], 503);
        }

        $customerStmt = $pdo->prepare('SELECT id FROM customers WHERE email = ?');
        $customerStmt->execute([$email]);
        $customerId = $customerStmt->fetchColumn();
        if ($customerId !== false) {
            $token = bin2hex(random_bytes(32));
            $now = gmdate('Y-m-d H:i:s');
            $expiresAt = gmdate('Y-m-d H:i:s', time() + 3600);
            $pdo->prepare('DELETE FROM password_reset_tokens WHERE customer_id = ? OR expires_at <= ?')
                ->execute([(int)$customerId, $now]);
            $insertToken = $pdo->prepare('INSERT INTO password_reset_tokens (customer_id, token_hash, expires_at) VALUES (?, ?, ?)');
            $insertToken->execute([(int)$customerId, hash('sha256', $token), $expiresAt]);

            $resetUrl = 'https://wonderfulcollection.store/reset-password.html?token=' . rawurlencode($token);
            $message = "A password reset was requested for your Wonderful Collection account.\n\n"
                . "Use this one-time link within 1 hour:\n" . $resetUrl . "\n\n"
                . "If you did not request this, you can ignore this message.";
            $headers = "From: Wonderful Collection <" . $mailFrom . ">\r\n"
                . "Content-Type: text/plain; charset=UTF-8\r\n";
            if (!mail($email, 'Reset your Wonderful Collection password', $message, $headers)) {
                $pdo->prepare('DELETE FROM password_reset_tokens WHERE token_hash = ?')->execute([hash('sha256', $token)]);
                logSecurityEvent('password_reset_delivery_failed');
            }
        }

        jsonResponse(['status' => 'success', 'message' => 'If an account exists for that email, password reset instructions have been sent.']);
        break;

    case 'reset_password':
        enforceApiRateLimit($pdo, 'password_reset_complete', 10, 900);
        $token = is_string($data['token'] ?? null) ? trim($data['token']) : '';
        $newPassword = is_string($data['password'] ?? null) ? $data['password'] : '';
        if (!preg_match('/^[a-f0-9]{64}$/i', $token) || strlen($newPassword) < 12 || strlen($newPassword) > 72) {
            jsonResponse(['error' => 'Use a valid reset link and a password between 12 and 72 characters.'], 422);
        }

        try {
            $pdo->beginTransaction();
            $resetQuery = 'SELECT customer_id FROM password_reset_tokens WHERE token_hash = ? AND expires_at > ?';
            if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql') {
                $resetQuery .= ' FOR UPDATE';
            }
            $resetStmt = $pdo->prepare($resetQuery);
            $resetStmt->execute([hash('sha256', $token), gmdate('Y-m-d H:i:s')]);
            $resetRecord = $resetStmt->fetch();
            if (!$resetRecord) {
                $pdo->rollBack();
                jsonResponse(['error' => 'This password reset link is invalid or has expired.'], 400);
            }

            $updatePassword = $pdo->prepare('UPDATE customers SET password_hash = ? WHERE id = ?');
            $updatePassword->execute([password_hash($newPassword, PASSWORD_DEFAULT), (int)$resetRecord['customer_id']]);
            $pdo->prepare('DELETE FROM password_reset_tokens WHERE customer_id = ?')
                ->execute([(int)$resetRecord['customer_id']]);
            $pdo->prepare('DELETE FROM customer_tokens WHERE customer_id = ?')
                ->execute([(int)$resetRecord['customer_id']]);
            $pdo->commit();
            logSecurityEvent('password_reset_completed');
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Wonderful Collection password reset failed.');
            jsonResponse(['error' => 'Could not reset the password. Please try again.'], 500);
        }

        jsonResponse(['status' => 'success', 'message' => 'Your password has been updated. Sign in with the new password.']);
        break;

    case 'verify_email':
        enforceApiRateLimit($pdo, 'email_verification', 10, 900);
        $token = is_string($data['token'] ?? null) ? trim($data['token']) : '';
        if (!preg_match('/^[a-f0-9]{64}$/i', $token)) {
            jsonResponse(['error' => 'This verification link is invalid or has expired.'], 400);
        }

        $now = gmdate('Y-m-d H:i:s');
        $verificationStmt = $pdo->prepare("
            SELECT customer_id FROM customer_email_verifications
            WHERE token_hash = ? AND expires_at > ? AND verified_at IS NULL
        ");
        $verificationStmt->execute([hash('sha256', $token), $now]);
        $customerId = $verificationStmt->fetchColumn();
        if ($customerId === false) {
            jsonResponse(['error' => 'This verification link is invalid or has expired.'], 400);
        }

        $verify = $pdo->prepare("
            UPDATE customer_email_verifications
            SET token_hash = NULL, expires_at = NULL, verified_at = ?
            WHERE customer_id = ? AND token_hash = ? AND verified_at IS NULL
        ");
        $verify->execute([$now, (int)$customerId, hash('sha256', $token)]);
        if ($verify->rowCount() !== 1) {
            jsonResponse(['error' => 'This verification link is invalid or has already been used.'], 409);
        }
        logSecurityEvent('customer_email_verified');
        jsonResponse(['status' => 'success', 'message' => 'Email verified. You can now sign in.']);
        break;

    case 'resend_verification':
        enforceApiRateLimit($pdo, 'email_verification_resend', 5, 3600);
        $email = trim(is_string($data['email'] ?? null) ? $data['email'] : '');
        if ($email === '' || strlen($email) > 150 || !filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['error' => 'Enter a valid email address.'], 422);
        }

        $mailFrom = getMailFromAddress();
        if ($mailFrom === '' || !filter_var($mailFrom, FILTER_VALIDATE_EMAIL)) {
            logSecurityEvent('email_delivery_unconfigured');
            jsonResponse(['error' => 'Verification email delivery is temporarily unavailable. Please try again later.'], 503);
        }

        $pendingStmt = $pdo->prepare("
            SELECT c.id, c.email FROM customers c
            INNER JOIN customer_email_verifications v ON v.customer_id = c.id
            WHERE c.email = ? AND v.verified_at IS NULL
        ");
        $pendingStmt->execute([$email]);
        $pendingCustomer = $pendingStmt->fetch();
        if ($pendingCustomer) {
            $token = bin2hex(random_bytes(32));
            $expiresAt = gmdate('Y-m-d H:i:s', time() + 86400);
            $updateToken = $pdo->prepare("
                UPDATE customer_email_verifications
                SET token_hash = ?, expires_at = ?
                WHERE customer_id = ? AND verified_at IS NULL
            ");
            $updateToken->execute([
                hash('sha256', $token),
                $expiresAt,
                (int)$pendingCustomer['id']
            ]);
            if ($updateToken->rowCount() !== 1) {
                jsonResponse([
                    'status' => 'success',
                    'message' => 'If an unverified account exists for that email, a new verification link has been sent.'
                ]);
            }
            $verificationUrl = 'https://wonderfulcollection.store/verify-email.html?token=' . rawurlencode($token);
            $mailBody = "Verify your Wonderful Collection account within 24 hours:\n\n"
                . $verificationUrl . "\n\nIf you did not create this account, ignore this message.";
            $mailHeaders = "From: Wonderful Collection <" . $mailFrom . ">\r\n"
                . "Content-Type: text/plain; charset=UTF-8\r\n";
            if (!mail($pendingCustomer['email'], 'Verify your Wonderful Collection account', $mailBody, $mailHeaders)) {
                logSecurityEvent('email_verification_delivery_failed');
                jsonResponse(['error' => 'Verification email could not be sent. Please try again later.'], 503);
            }
        }

        jsonResponse([
            'status' => 'success',
            'message' => 'If an unverified account exists for that email, a new verification link has been sent.'
        ]);
        break;

    case 'register':
        enforceApiRateLimit($pdo, 'register', 5, 3600);
        $name = trim(is_string($data['name'] ?? null) ? $data['name'] : '');
        $email = trim(is_string($data['email'] ?? null) ? $data['email'] : '');
        $phone = trim(is_string($data['phone'] ?? null) ? $data['phone'] : '');
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        $address = trim(is_string($data['address'] ?? null) ? $data['address'] : '');
        $area = trim(is_string($data['area'] ?? null) ? $data['area'] : 'Dhaka');

        if ($name === '' || $email === '' || $phone === '' || $password === '') {
            jsonResponse(['error' => 'Name, email, phone, and password are required'], 422);
        }
        if (strlen($name) > 150 || strlen($email) > 150 || strlen($phone) > 30
            || strlen($address) > 4000 || strlen($area) > 100
            || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $name . $phone . $address . $area)) {
            jsonResponse(['error' => 'One or more account fields are invalid or too long.'], 422);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['error' => 'Please provide a valid email address.'], 422);
        }
        if (!preg_match('/^\+?[0-9][0-9\s()-]{6,28}$/', $phone)) {
            jsonResponse(['error' => 'Please provide a valid phone number.'], 422);
        }
        if (strlen($password) < 12 || strlen($password) > 72) {
            jsonResponse(['error' => 'Password must be between 12 and 72 characters.'], 422);
        }

        $check = $pdo->prepare('SELECT id FROM customers WHERE email = ?');
        $check->execute([$email]);
        if ($check->fetch()) {
            jsonResponse(['error' => 'An account with this email already exists'], 409);
        }

        $mailFrom = getMailFromAddress();
        if (!$mailFrom || !filter_var($mailFrom, FILTER_VALIDATE_EMAIL)) {
            logSecurityEvent('email_delivery_unconfigured');
            jsonResponse(['error' => 'Account registration is temporarily unavailable. Please contact store support.'], 503);
        }

        $passHash = password_hash($password, PASSWORD_DEFAULT);
        $verificationToken = bin2hex(random_bytes(32));
        $verificationExpiresAt = gmdate('Y-m-d H:i:s', time() + 86400);
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("
                INSERT INTO customers (name, email, phone, password_hash, address, area, city)
                VALUES (?, ?, ?, ?, ?, ?, 'Dhaka')
            ");
            $stmt->execute([$name, $email, $phone, $passHash, $address, $area]);
            $custId = (int)$pdo->lastInsertId();
            $verification = $pdo->prepare("
                INSERT INTO customer_email_verifications (customer_id, token_hash, expires_at)
                VALUES (?, ?, ?)
            ");
            $verification->execute([$custId, hash('sha256', $verificationToken), $verificationExpiresAt]);
            $verificationUrl = 'https://wonderfulcollection.store/verify-email.html?token=' . rawurlencode($verificationToken);
            $mailBody = "Verify your Wonderful Collection account within 24 hours:\n\n"
                . $verificationUrl . "\n\nIf you did not create this account, ignore this message.";
            $mailHeaders = "From: Wonderful Collection <" . $mailFrom . ">\r\n"
                . "Content-Type: text/plain; charset=UTF-8\r\n";
            if (!mail($email, 'Verify your Wonderful Collection account', $mailBody, $mailHeaders)) {
                throw new RuntimeException('Verification email delivery failed.');
            }
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            logSecurityEvent('email_verification_delivery_failed');
            jsonResponse(['error' => 'Could not create the account or send a verification email. Please try again later.'], 503);
        }

        jsonResponse([
            'status' => 'success',
            'message' => 'Account created. Check your email and verify it within 24 hours before signing in.',
            'data' => [
                'id' => $custId,
                'customer_id' => $custId,
                'name' => $name,
                'email' => $email,
                'phone' => $phone
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

        if (isLoginRateLimited($pdo, $email)) {
            header('Retry-After: 900');
            jsonResponse(['error' => 'Too many login attempts. Try again in 15 minutes.'], 429);
        }

        $stmt = $pdo->prepare("
            SELECT c.* FROM customers c
            INNER JOIN customer_email_verifications v ON v.customer_id = c.id
            WHERE c.email = ? AND v.verified_at IS NOT NULL
        ");
        $stmt->execute([$email]);
        $customer = $stmt->fetch();
        if (!$customer || !password_verify($password, $customer['password_hash'])) {
            logSecurityEvent('customer_login_failed');
            if (recordLoginFailure($pdo, $email)) {
                header('Retry-After: 900');
                jsonResponse(['error' => 'Too many login attempts. Try again in 15 minutes.'], 429);
            }
            jsonResponse(['error' => 'Invalid email or password'], 401);
        }

        clearLoginAttempts($pdo, $email);
        if (password_needs_rehash($customer['password_hash'], PASSWORD_DEFAULT)) {
            $rehash = $pdo->prepare('UPDATE customers SET password_hash = ? WHERE id = ?');
            $rehash->execute([password_hash($password, PASSWORD_DEFAULT), (int)$customer['id']]);
        }
        unset($customer['password_hash']);
        $session = createCustomerSession($pdo, (int)$customer['id']);
        $customer['token'] = $session['token'];
        $customer['token_expires_at'] = $session['expires_at'];

        jsonResponse([
            'status' => 'success',
            'message' => 'Welcome back, ' . $customer['name'],
            'data' => $customer
        ]);
        break;
}
