<?php
/**
 * Authentication API Endpoint
 * Handles admin sign-in and customer sign-in / registration.
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/admin-mfa.php';

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

function requireSuperAdminManagement(array $admin): void {
    if (($admin['role'] ?? '') !== 'Super Admin') {
        jsonResponse(['error' => 'Only a Super Admin can manage staff accounts and roles.'], 403);
    }
}

function isBuiltInAdminRoleName(string $roleName): bool {
    foreach (['Super Admin', 'Inventory Manager', 'Order Manager', 'Sales Manager', 'Accountant', 'Viewer'] as $builtInRole) {
        if (strcasecmp($roleName, $builtInRole) === 0) {
            return true;
        }
    }
    return false;
}

function adminRolePermissionCatalog(): array {
    return [
        'categories.read', 'categories.create', 'categories.update', 'categories.archive',
        'products.read', 'products.create', 'products.update', 'products.archive', 'products.images.upload',
        'orders.read', 'orders.update', 'customers.read', 'customers.update',
        'coupons.read', 'coupons.create', 'coupons.update', 'coupons.archive',
        'inventory.read', 'inventory.adjust', 'inventory.set',
        'reports.read', 'settings.read', 'settings.update',
        'support.read', 'support.update', 'feedback.read', 'feedback.update',
        'accounts.read', 'accounts.transactions.read', 'accounts.transactions.create',
        'accounts.salaries.read', 'accounts.salaries.pay',
        'sales.read', 'sales.create', 'suppliers.read', 'suppliers.create',
        'couriers.read', 'couriers.create',
    ];
}

switch ($action) {
    case 'admin_login':
        if (isAdminWebClient() && !isTrustedAdminWebOrigin()) {
            jsonResponse(['error' => 'Admin sign-in is unavailable from this origin.'], 403);
        }
        $username = is_string($data['username'] ?? null) ? trim($data['username']) : '';
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        if ($username === '' || $password === '') {
            jsonResponse(['error' => 'Please enter username and password'], 400);
        }

        if (isLoginRateLimited($pdo, $username)) {
            logSecurityEvent('admin_login_rate_limited');
            header('Retry-After: 900');
            jsonResponse(['error' => 'Too many sign-in attempts. Please wait and try again.'], 429);
        }

        $isLocalRequest = isLocalDevelopmentRequest();
        if (!$isLocalRequest && !isAdminMfaConfigured()) {
            logSecurityEvent('admin_mfa_unconfigured');
            jsonResponse(['error' => 'Admin sign-in is disabled until MFA is configured in api/config.local.php.'], 503);
        }
        $stmt = $pdo->prepare('SELECT * FROM admins WHERE username = ?');
        $stmt->execute([$username]);
        $admin = $stmt->fetch();
        $passwordValid = $admin && password_verify($password, $admin['password_hash']);
        if (!$admin || !$passwordValid || (int)($admin['is_active'] ?? 1) !== 1) {
            recordLoginFailure($pdo, $username);
            logSecurityEvent('admin_login_failed');
            jsonResponse(['error' => 'Invalid admin credentials'], 401);
        }

        if (!$isLocalRequest) {
            $totpCounter = verifyAdminTotp(is_string($data['totp_code'] ?? null) ? $data['totp_code'] : '');
            if ($totpCounter === null) {
                recordLoginFailure($pdo, $username);
                logSecurityEvent('admin_mfa_failed');
                jsonResponse(['error' => 'Invalid admin credentials'], 401);
            }
            if (!consumeAdminTotpCounter($pdo, (int)$admin['id'], $totpCounter)) {
                recordLoginFailure($pdo, $username);
                logSecurityEvent('admin_mfa_replay_rejected');
                jsonResponse(['error' => 'Invalid admin credentials'], 401);
            }
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
        if (isAdminWebClient()) {
            setAdminWebCookie($token, $expiresAt);
        }

        $loginData = [
            'expires_at' => $expiresAt,
            'admin_id' => $admin['id'],
            'username' => $admin['username'],
            'full_name' => $admin['full_name'],
            'role' => $admin['role'],
            'must_change_password' => $passwordChangeRequired
        ];
        if (!isAdminWebClient()) {
            $loginData['token'] = $token;
        }
        jsonResponse([
            'status' => 'success',
            'message' => 'Admin login successful',
            'data' => $loginData
        ]);
        break;

    case 'admin_permissions':
        $admin = requireAdminToken($pdo, true);
        jsonResponse([
            'status' => 'success',
            'data' => [
                'role' => $admin['role'],
                'permissions' => adminRolePermissions((string)$admin['role'])
            ]
        ]);
        break;

    case 'admin_list_roles':
        $admin = requireAdminToken($pdo);
        requireSuperAdminManagement($admin);
        $roles = [];
        foreach (adminRoleNames() as $role) {
            $roles[] = ['name' => $role, 'permissions' => adminRolePermissions($role)];
        }
        jsonResponse(['status' => 'success', 'data' => $roles]);
        break;

    case 'admin_list_users':
        $admin = requireAdminToken($pdo);
        requireSuperAdminManagement($admin);
        $stmt = $pdo->query('SELECT id, username, full_name, role, is_active, created_at FROM admins ORDER BY id ASC');
        $users = $stmt->fetchAll();
        foreach ($users as &$user) {
            $user['is_current'] = (int)$user['id'] === (int)$admin['id'];
        }
        unset($user);
        jsonResponse(['status' => 'success', 'data' => $users]);
        break;

    case 'admin_create_user':
        $admin = requireAdminToken($pdo);
        requireSuperAdminManagement($admin);
        enforceApiRateLimit($pdo, 'admin_user_create', 10, 900);
        $username = is_string($data['username'] ?? null) ? trim($data['username']) : '';
        $fullName = is_string($data['full_name'] ?? null) ? trim($data['full_name']) : '';
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        $role = is_string($data['role'] ?? null) ? trim($data['role']) : '';
        if (!preg_match('/\A[a-zA-Z0-9._-]{3,48}\z/', $username)
            || $fullName === '' || strlen($fullName) > 120
            || strlen($password) < 14 || strlen($password) > 72
            || !in_array($role, adminRoleNames(), true)) {
            jsonResponse(['error' => 'Enter a valid username, name, 14–72 character password, and role.'], 422);
        }
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare(
                'INSERT INTO admins (username, password_hash, full_name, role, is_active, password_change_required)
                 VALUES (?, ?, ?, ?, 1, 1)'
            );
            $stmt->execute([$username, password_hash($password, PASSWORD_DEFAULT), $fullName, $role]);
            $newId = (int)$pdo->lastInsertId();
            $audit = $pdo->prepare(
                'INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, new_values, ip_address)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            $audit->execute([(int)$admin['id'], 'create_admin', 'admin', $newId,
                json_encode(['username' => $username, 'role' => $role]), $_SERVER['REMOTE_ADDR'] ?? 'unknown']);
            $pdo->commit();
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            if ((string)$e->getCode() === '23000' || (string)$e->getCode() === '19') {
                jsonResponse(['error' => 'That username is already in use.'], 409);
            }
            error_log('Shopademia admin account creation failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not create the administrator account.'], 500);
        }
        jsonResponse(['status' => 'success', 'message' => 'Administrator account created.']);
        break;

    case 'admin_deactivate_user':
        $admin = requireAdminToken($pdo);
        requireSuperAdminManagement($admin);
        enforceApiRateLimit($pdo, 'admin_user_deactivate', 10, 900);
        $targetId = filter_var($data['admin_id'] ?? null, FILTER_VALIDATE_INT);
        if ($targetId === false || $targetId < 1 || (int)$admin['id'] === $targetId) {
            jsonResponse(['error' => 'Choose another valid administrator account.'], 422);
        }
        try {
            $pdo->beginTransaction();
            $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
            $stmt = $pdo->prepare('SELECT id, role, is_active FROM admins WHERE id = ?' . $lock);
            $stmt->execute([$targetId]);
            $target = $stmt->fetch();
            if (!$target || (int)$target['is_active'] !== 1) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Active administrator not found.'], 404);
            }
            if ($target['role'] === 'Super Admin') {
                $ownerLock = $pdo->prepare(
                    'SELECT id FROM admins WHERE role = ? AND is_active = 1 ORDER BY id' . $lock
                );
                $ownerLock->execute(['Super Admin']);
                $owners = $ownerLock->fetchAll(PDO::FETCH_COLUMN);
                if (count($owners) <= 1) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'The last active Super Admin cannot be deactivated.'], 409);
                }
            }
            $pdo->prepare('UPDATE admins SET is_active = 0 WHERE id = ?')->execute([$targetId]);
            $pdo->prepare('DELETE FROM admin_tokens WHERE admin_id = ?')->execute([$targetId]);
            $audit = $pdo->prepare(
                'INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, old_values, new_values, ip_address)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $audit->execute([(int)$admin['id'], 'deactivate_admin', 'admin', $targetId,
                json_encode(['is_active' => 1]), json_encode(['is_active' => 0]),
                $_SERVER['REMOTE_ADDR'] ?? 'unknown']);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('Shopademia admin account deactivation failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not deactivate the administrator account.'], 500);
        }
        jsonResponse(['status' => 'success', 'message' => 'Administrator account deactivated.']);
        break;

    case 'admin_reset_user_password':
        $admin = requireAdminToken($pdo);
        requireSuperAdminManagement($admin);
        enforceApiRateLimit($pdo, 'admin_user_password_reset', 5, 900);
        $targetId = filter_var($data['admin_id'] ?? null, FILTER_VALIDATE_INT);
        $currentPassword = is_string($data['current_password'] ?? null) ? $data['current_password'] : '';
        $temporaryPassword = is_string($data['temporary_password'] ?? null) ? $data['temporary_password'] : '';
        if ($targetId === false || $targetId < 1 || (int)$admin['id'] === $targetId
            || $currentPassword === '' || strlen($temporaryPassword) < 14 || strlen($temporaryPassword) > 72) {
            jsonResponse(['error' => 'Choose another active administrator and enter your current password and a 14–72 character temporary password.'], 422);
        }

        $adminPassword = $pdo->prepare('SELECT password_hash FROM admins WHERE id = ? AND is_active = 1');
        $adminPassword->execute([(int)$admin['id']]);
        $passwordHash = $adminPassword->fetchColumn();
        if (!is_string($passwordHash) || !password_verify($currentPassword, $passwordHash)) {
            jsonResponse(['error' => 'Current password is incorrect.'], 401);
        }

        try {
            $pdo->beginTransaction();
            $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
            $targetStmt = $pdo->prepare(
                'SELECT id, username, is_active, password_change_required FROM admins WHERE id = ?' . $lock
            );
            $targetStmt->execute([$targetId]);
            $target = $targetStmt->fetch();
            if (!$target || (int)$target['is_active'] !== 1) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Active administrator not found.'], 404);
            }

            $pdo->prepare(
                'UPDATE admins SET password_hash = ?, password_change_required = 1 WHERE id = ?'
            )->execute([password_hash($temporaryPassword, PASSWORD_DEFAULT), $targetId]);
            $pdo->prepare('DELETE FROM admin_tokens WHERE admin_id = ?')->execute([$targetId]);
            $audit = $pdo->prepare(
                'INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, old_values, new_values, ip_address)
                 VALUES (?, ?, ?, ?, ?, ?, ?)'
            );
            $audit->execute([
                (int)$admin['id'],
                'reset_admin_password',
                'admin',
                $targetId,
                json_encode(['password_change_required' => (int)$target['password_change_required'] === 1]),
                json_encode(['username' => $target['username'], 'password_change_required' => true, 'sessions_revoked' => true]),
                $_SERVER['REMOTE_ADDR'] ?? 'unknown'
            ]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('Shopademia administrator password reset failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not reset the administrator password.'], 500);
        }
        jsonResponse([
            'status' => 'success',
            'message' => 'Temporary password set; the administrator must change it at next sign-in.'
        ]);
        break;

    case 'admin_save_role':
        $admin = requireAdminToken($pdo);
        requireSuperAdminManagement($admin);
        enforceApiRateLimit($pdo, 'admin_role_save', 20, 900);
        $roleName = is_string($data['name'] ?? null) ? trim($data['name']) : '';
        $permissions = $data['permissions'] ?? null;
        if (!preg_match('/\A[A-Za-z][A-Za-z0-9 _-]{1,39}\z/', $roleName)
            || isBuiltInAdminRoleName($roleName)
            || !is_array($permissions) || count($permissions) > 60
            || count(array_filter($permissions, 'is_string')) !== count($permissions)
            || array_diff($permissions, adminRolePermissionCatalog()) !== []) {
            jsonResponse(['error' => 'Enter a custom role name and choose valid permissions.'], 422);
        }
        $permissions = array_values(array_unique($permissions));
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare(
                'INSERT INTO admin_role_definitions (role_name, permissions_json, created_at, updated_at)
                 VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                 ON DUPLICATE KEY UPDATE permissions_json = VALUES(permissions_json), updated_at = CURRENT_TIMESTAMP'
            );
            if ($pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'sqlite') {
                $stmt = $pdo->prepare(
                    'INSERT INTO admin_role_definitions (role_name, permissions_json, created_at, updated_at)
                     VALUES (?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                     ON CONFLICT(role_name) DO UPDATE SET permissions_json = excluded.permissions_json,
                         updated_at = CURRENT_TIMESTAMP'
                );
            }
            $stmt->execute([$roleName, json_encode($permissions, JSON_THROW_ON_ERROR)]);
            $audit = $pdo->prepare(
                'INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, new_values, ip_address)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            $audit->execute([(int)$admin['id'], 'save_admin_role', 'admin_role', 0,
                json_encode(['role' => $roleName, 'permissions' => $permissions]),
                $_SERVER['REMOTE_ADDR'] ?? 'unknown']);
            $pdo->commit();
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('Shopademia role definition save failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not save this role.'], 500);
        }
        jsonResponse(['status' => 'success', 'message' => 'Role saved.']);
        break;

    case 'admin_delete_role':
        $admin = requireAdminToken($pdo);
        requireSuperAdminManagement($admin);
        $roleName = is_string($data['name'] ?? null) ? trim($data['name']) : '';
        if ($roleName === '' || isBuiltInAdminRoleName($roleName)) {
            jsonResponse(['error' => 'Built-in roles cannot be deleted.'], 422);
        }
        $used = $pdo->prepare('SELECT COUNT(*) FROM admins WHERE role = ? AND is_active = 1');
        $used->execute([$roleName]);
        if ((int)$used->fetchColumn() > 0) {
            jsonResponse(['error' => 'Reassign active staff using this role before deleting it.'], 409);
        }
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare('DELETE FROM admin_role_definitions WHERE role_name = ?');
            $stmt->execute([$roleName]);
            if ($stmt->rowCount() !== 1) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Custom role not found.'], 404);
            }
            $audit = $pdo->prepare(
                'INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, old_values, ip_address)
                 VALUES (?, ?, ?, ?, ?, ?)'
            );
            $audit->execute([(int)$admin['id'], 'delete_admin_role', 'admin_role', 0,
                json_encode(['role' => $roleName]), $_SERVER['REMOTE_ADDR'] ?? 'unknown']);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            error_log('Shopademia role definition delete failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not delete the custom role.'], 500);
        }
        jsonResponse(['status' => 'success', 'message' => 'Role deleted.']);
        break;

    case 'admin_assign_role':
        $admin = requireAdminToken($pdo);
        requireSuperAdminManagement($admin);
        enforceApiRateLimit($pdo, 'admin_role_assignment', 20, 900);
        $targetId = filter_var($data['admin_id'] ?? null, FILTER_VALIDATE_INT);
        $newRole = is_string($data['role'] ?? null) ? trim($data['role']) : '';
        if ($targetId === false || $targetId < 1 || !in_array($newRole, adminRoleNames(), true)) {
            jsonResponse(['error' => 'Choose a valid administrator and role.'], 422);
        }
        if ((int)$admin['id'] === $targetId) {
            jsonResponse(['error' => 'Ask another Super Admin to change your role.'], 422);
        }

        try {
            $pdo->beginTransaction();
            $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
            $owners = [];
            if ($newRole !== 'Super Admin') {
                $ownerStmt = $pdo->prepare("SELECT id FROM admins WHERE role = ? AND is_active = 1 ORDER BY id" . $lock);
                $ownerStmt->execute(['Super Admin']);
                $owners = $ownerStmt->fetchAll(PDO::FETCH_COLUMN);
            }
            $targetStmt = $pdo->prepare('SELECT id, username, full_name, role, is_active FROM admins WHERE id = ?' . $lock);
            $targetStmt->execute([$targetId]);
            $target = $targetStmt->fetch();
            if (!$target || (int)$target['is_active'] !== 1) {
                $pdo->rollBack();
                jsonResponse(['error' => 'Administrator not found.'], 404);
            }
            if ($target['role'] === 'Super Admin' && $newRole !== 'Super Admin') {
                if (count($owners) <= 1) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'The last Super Admin cannot be demoted.'], 409);
                }
            }

            $update = $pdo->prepare('UPDATE admins SET role = ? WHERE id = ?');
            $update->execute([$newRole, $targetId]);
            $audit = $pdo->prepare('
                INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, old_values, new_values, ip_address)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            ');
            $audit->execute([
                (int)$admin['id'],
                'assign_role',
                'admin',
                $targetId,
                json_encode(['role' => $target['role']]),
                json_encode(['role' => $newRole]),
                $_SERVER['REMOTE_ADDR'] ?? 'unknown'
            ]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            error_log('Shopademia role assignment failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not update the administrator role. Please try again.'], 500);
        }

        jsonResponse(['status' => 'success', 'message' => 'Administrator role updated.']);
        break;

    case 'admin_session':
        $admin = requireAdminToken($pdo, true);
        jsonResponse([
            'status' => 'success',
            'data' => [
                'username' => $admin['username'],
                'full_name' => $admin['full_name'],
                'role' => $admin['role'],
                'expires_at' => $admin['expires_at'],
                'must_change_password' => (int)$admin['password_change_required'] === 1
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
            error_log('Shopademia admin password update failed: ' . $e->getMessage());
            jsonResponse(['error' => 'Could not update the admin password. Please try again.'], 500);
        }

        if (isAdminWebClient()) {
            setAdminWebCookie($token, $expiresAt);
        }

        $passwordChangeData = ['expires_at' => $expiresAt];
        if (!isAdminWebClient()) {
            $passwordChangeData['token'] = $token;
        }
        jsonResponse([
            'status' => 'success',
            'message' => 'Admin password updated.',
            'data' => $passwordChangeData
        ]);
        break;

    case 'admin_logout':
        requireAdminToken($pdo, true);
        $token = getAdminTokenFromRequest();
        $stmt = $pdo->prepare('DELETE FROM admin_tokens WHERE token_hash = ?');
        $stmt->execute([hash('sha256', $token)]);
        if (isAdminWebClient()) {
            clearAdminWebCookie();
        }
        jsonResponse(['status' => 'success', 'message' => 'Admin logged out']);
        break;

    case 'customer_logout':
        requireCustomerToken($pdo);
        $token = getBearerTokenFromRequest();
        $stmt = $pdo->prepare('DELETE FROM customer_tokens WHERE token_hash = ?');
        $stmt->execute([hash('sha256', $token)]);
        jsonResponse(['status' => 'success', 'message' => 'You have signed out.']);
        break;

    case 'customer_session':
        $customer = requireCustomerToken($pdo);
        $profileStmt = $pdo->prepare("
            SELECT c.id, c.name, c.email, c.phone, c.whatsapp_phone, c.notify_email,
                c.notify_whatsapp, c.notify_website, c.address, c.area, c.city,
                c.home_house_flat, c.home_road, c.home_village_area, c.home_union_ward,
                c.home_upazila_thana, c.home_district, c.home_division, c.home_postcode,
                c.created_at, (v.verified_at IS NOT NULL) AS email_verified
            FROM customers c
            LEFT JOIN customer_email_verifications v ON v.customer_id = c.id
            WHERE c.id = ?
        ");
        $profileStmt->execute([(int)$customer['id']]);
        $profile = $profileStmt->fetch();
        if (!$profile) {
            jsonResponse(['error' => 'Customer account not found.'], 401);
        }
        jsonResponse(['status' => 'success', 'data' => $profile]);
        break;

    case 'customer_update_profile':
        $customer = requireCustomerToken($pdo);
        $name = trim(is_string($data['name'] ?? null) ? $data['name'] : '');
        $phone = normalizeBangladeshMobile(is_string($data['phone'] ?? null) ? $data['phone'] : '');
        $area = trim(is_string($data['area'] ?? null) ? $data['area'] : '');
        $address = trim(is_string($data['address'] ?? null) ? $data['address'] : '');
        $whatsappPhoneValue = trim(is_string($data['whatsapp_phone'] ?? null) ? $data['whatsapp_phone'] : '');
        $whatsappPhone = $whatsappPhoneValue === '' ? null : normalizeBangladeshMobile($whatsappPhoneValue);
        $homeFields = [
            'home_house_flat' => 150,
            'home_road' => 150,
            'home_village_area' => 150,
            'home_union_ward' => 150,
            'home_upazila_thana' => 100,
            'home_district' => 100,
            'home_division' => 100,
            'home_postcode' => 20
        ];
        $homeValues = [];
        foreach ($homeFields as $field => $maxLength) {
            $value = $data[$field] ?? '';
            if (!is_string($value) || strlen($value) > $maxLength) {
                jsonResponse(['error' => 'One or more home-address fields are invalid or too long.'], 422);
            }
            $value = trim($value);
            if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value)) {
                jsonResponse(['error' => 'One or more home-address fields are invalid or too long.'], 422);
            }
            $homeValues[$field] = $value === '' ? null : $value;
        }
        $preferenceFields = ['notify_email', 'notify_whatsapp', 'notify_website'];
        $preferences = [];
        foreach ($preferenceFields as $field) {
            if (!is_bool($data[$field] ?? null)) {
                jsonResponse(['error' => 'Choose valid notification preferences.'], 422);
            }
            $preferences[$field] = $data[$field] ? 1 : 0;
        }
        if ($name === '' || strlen($name) > 150 || $phone === null
            || strlen($area) > 100 || strlen($address) > 4000
            || ($whatsappPhoneValue !== '' && $whatsappPhone === null)
            || ($preferences['notify_whatsapp'] === 1 && $whatsappPhone === null)
            || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $name . $area . $address)) {
            jsonResponse(['error' => 'Enter a valid name, phone number, area, and address.'], 422);
        }

        $duplicatePhone = $pdo->prepare('SELECT id FROM customers WHERE phone = ? AND id <> ? LIMIT 1');
        $duplicatePhone->execute([$phone, (int)$customer['id']]);
        if ($duplicatePhone->fetchColumn() !== false) {
            jsonResponse(['error' => 'Phone already registered.'], 409);
        }

        $updateProfile = $pdo->prepare("
            UPDATE customers
            SET name = ?, phone = ?, whatsapp_phone = ?, notify_email = ?, notify_whatsapp = ?,
                notify_website = ?, area = ?, address = ?, home_house_flat = ?, home_road = ?,
                home_village_area = ?, home_union_ward = ?, home_upazila_thana = ?,
                home_district = ?, home_division = ?, home_postcode = ?
            WHERE id = ?
        ");
        $updateProfile->execute([
            $name,
            $phone,
            $whatsappPhone,
            $preferences['notify_email'],
            $preferences['notify_whatsapp'],
            $preferences['notify_website'],
            $area,
            $address,
            ...array_values($homeValues),
            (int)$customer['id']
        ]);
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
            error_log('Shopademia account deletion failed.');
            jsonResponse(['error' => 'Could not delete the account. Please try again.'], 500);
        }

        jsonResponse(['status' => 'success', 'message' => 'Your account has been deleted.']);
        break;

    case 'request_password_reset':
        enforceApiRateLimit($pdo, 'password_reset_request', 5, 3600);
        $email = strtolower(trim(is_string($data['email'] ?? null) ? $data['email'] : ''));
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

            $resetUrl = 'https://shopademia.store/reset-password.html?token=' . rawurlencode($token);
            $message = "A password reset was requested for your Shopademia account.\n\n"
                . "Use this one-time link within 1 hour:\n" . $resetUrl . "\n\n"
                . "If you did not request this, you can ignore this message.";
            $headers = "From: Shopademia <" . $mailFrom . ">\r\n"
                . "Content-Type: text/plain; charset=UTF-8\r\n";
            if (!mail($email, 'Reset your Shopademia password', $message, $headers)) {
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
            error_log('Shopademia password reset failed.');
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
        $email = strtolower(trim(is_string($data['email'] ?? null) ? $data['email'] : ''));
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
            $verificationUrl = 'https://shopademia.store/verify-email.html?token=' . rawurlencode($token);
            $mailBody = "Verify your Shopademia account within 24 hours:\n\n"
                . $verificationUrl . "\n\nIf you did not create this account, ignore this message.";
            $mailHeaders = "From: Shopademia <" . $mailFrom . ">\r\n"
                . "Content-Type: text/plain; charset=UTF-8\r\n";
            if (!mail($pendingCustomer['email'], 'Verify your Shopademia account', $mailBody, $mailHeaders)) {
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
        $email = strtolower(trim(is_string($data['email'] ?? null) ? $data['email'] : ''));
        $phoneValue = trim(is_string($data['phone'] ?? null) ? $data['phone'] : '');
        $phone = normalizeBangladeshMobile($phoneValue);
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        $address = trim(is_string($data['address'] ?? null) ? $data['address'] : '');
        $area = trim(is_string($data['area'] ?? null) ? $data['area'] : 'Dhaka');
        $whatsappPhoneValue = trim(is_string($data['whatsapp_phone'] ?? null) ? $data['whatsapp_phone'] : '');
        $whatsappPhone = $whatsappPhoneValue === '' ? null : normalizeBangladeshMobile($whatsappPhoneValue);
        $homeFields = [
            'home_house_flat' => 150,
            'home_road' => 150,
            'home_village_area' => 150,
            'home_union_ward' => 150,
            'home_upazila_thana' => 100,
            'home_district' => 100,
            'home_division' => 100,
            'home_postcode' => 20
        ];
        $homeValues = [];
        foreach ($homeFields as $field => $maxLength) {
            $value = $data[$field] ?? '';
            if (!is_string($value) || strlen($value) > $maxLength) {
                jsonResponse(['error' => 'One or more home-address fields are invalid or too long.'], 422);
            }
            $value = trim($value);
            if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value)) {
                jsonResponse(['error' => 'One or more home-address fields are invalid or too long.'], 422);
            }
            $homeValues[$field] = $value === '' ? null : $value;
        }
        $preferenceFields = ['notify_email', 'notify_whatsapp', 'notify_website'];
        $preferences = [];
        foreach ($preferenceFields as $field) {
            $value = $data[$field] ?? false;
            if (!is_bool($value)) {
                jsonResponse(['error' => 'Choose valid notification preferences.'], 422);
            }
            $preferences[$field] = $value ? 1 : 0;
        }

        if ($name === '' || $email === '' || $phoneValue === '' || $password === '') {
            jsonResponse(['error' => 'Name, email, phone, and password are required'], 422);
        }
        if ($phone === null) {
            jsonResponse(['error' => 'Enter a valid Bangladesh mobile number starting with 013 to 019.'], 422);
        }
        if (strlen($name) > 150 || strlen($email) > 150
            || strlen($address) > 4000 || strlen($area) > 100
            || ($whatsappPhoneValue !== '' && $whatsappPhone === null)
            || ($preferences['notify_whatsapp'] === 1 && $whatsappPhone === null)
            || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $name . $address . $area)) {
            jsonResponse(['error' => 'One or more account fields are invalid or too long.'], 422);
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            jsonResponse(['error' => 'Please provide a valid email address.'], 422);
        }
        if (strlen($password) < 12 || strlen($password) > 72) {
            jsonResponse(['error' => 'Password must be between 12 and 72 characters.'], 422);
        }

        $check = $pdo->prepare('SELECT id, email, phone FROM customers WHERE email = ? OR phone = ? LIMIT 2');
        $check->execute([$email, $phone]);
        foreach ($check->fetchAll() as $existingCustomer) {
            if (strtolower(trim((string)$existingCustomer['email'])) === $email) {
                jsonResponse(['error' => 'Email already registered.'], 409);
            }
            if ((string)$existingCustomer['phone'] === $phone) {
                jsonResponse(['error' => 'Phone already registered.'], 409);
            }
        }

        $passHash = password_hash($password, PASSWORD_DEFAULT);
        $verificationToken = bin2hex(random_bytes(32));
        $verificationExpiresAt = gmdate('Y-m-d H:i:s', time() + 86400);
        try {
            $pdo->beginTransaction();
            $stmt = $pdo->prepare("
                INSERT INTO customers (
                    name, email, phone, whatsapp_phone, notify_email, notify_whatsapp, notify_website,
                    password_hash, address, area, city, home_house_flat, home_road,
                    home_village_area, home_union_ward, home_upazila_thana, home_district,
                    home_division, home_postcode
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Dhaka', ?, ?, ?, ?, ?, ?, ?, ?)
            ");
            $stmt->execute([
                $name,
                $email,
                $phone,
                $whatsappPhone,
                $preferences['notify_email'],
                $preferences['notify_whatsapp'],
                $preferences['notify_website'],
                $passHash,
                $address,
                $area,
                ...array_values($homeValues)
            ]);
            $custId = (int)$pdo->lastInsertId();
            $verification = $pdo->prepare("
                INSERT INTO customer_email_verifications (customer_id, token_hash, expires_at)
                VALUES (?, ?, ?)
            ");
            $verification->execute([$custId, hash('sha256', $verificationToken), $verificationExpiresAt]);
            $pdo->commit();
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            }
            if ($e instanceof PDOException && (string)$e->getCode() === '23000') {
                $existing = $pdo->prepare('SELECT email, phone FROM customers WHERE email = ? OR phone = ? LIMIT 2');
                $existing->execute([$email, $phone]);
                foreach ($existing->fetchAll() as $existingCustomer) {
                    if (strtolower(trim((string)$existingCustomer['email'])) === $email) {
                        jsonResponse(['error' => 'Email already registered.'], 409);
                    }
                    if ((string)$existingCustomer['phone'] === $phone) {
                        jsonResponse(['error' => 'Phone already registered.'], 409);
                    }
                }
            }
            logSecurityEvent('customer_registration_failed');
            jsonResponse(['error' => 'Account registration could not be completed. Please try again later.'], 503);
        }

        $mailFrom = getMailFromAddress();
        $verificationEmailSent = false;
        if ($mailFrom !== '' && filter_var($mailFrom, FILTER_VALIDATE_EMAIL)) {
            $verificationUrl = 'https://shopademia.store/verify-email.html?token=' . rawurlencode($verificationToken);
            $mailBody = "Verify your Shopademia account within 24 hours:\n\n"
                . $verificationUrl . "\n\nIf you did not create this account, ignore this message.";
            $mailHeaders = "From: Shopademia <" . $mailFrom . ">\r\n"
                . "Content-Type: text/plain; charset=UTF-8\r\n";
            try {
                $verificationEmailSent = mail($email, 'Verify your Shopademia account', $mailBody, $mailHeaders);
            } catch (Throwable $e) {
                $verificationEmailSent = false;
            }
        }
        if (!$verificationEmailSent) {
            logSecurityEvent('email_verification_delivery_failed');
        }

        jsonResponse([
            'status' => 'success',
            'message' => $verificationEmailSent
                ? 'Account created. Check your email and verify it within 24 hours before placing an order.'
                : 'Account created, but the verification email could not be sent. Please request a new link later.',
            'data' => [
                'id' => $custId,
                'customer_id' => $custId,
                'name' => $name,
                'email' => $email,
                'phone' => $phone,
                'verification_email_sent' => $verificationEmailSent
            ]
        ], 201);
        break;

    case 'login':
    default:
        $email = is_string($data['email'] ?? null) ? strtolower(trim($data['email'])) : '';
        $password = is_string($data['password'] ?? null) ? $data['password'] : '';
        if ($email === '' || $password === '') {
            jsonResponse(['error' => 'Email and password are required'], 400);
        }

        if (isLoginRateLimited($pdo, $email)) {
            header('Retry-After: 900');
            jsonResponse(['error' => 'Too many login attempts. Try again in 15 minutes.'], 429);
        }

        $stmt = $pdo->prepare("
            SELECT c.*, (v.verified_at IS NOT NULL) AS email_verified
            FROM customers c
            LEFT JOIN customer_email_verifications v ON v.customer_id = c.id
            WHERE LOWER(TRIM(c.email)) = ?
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
