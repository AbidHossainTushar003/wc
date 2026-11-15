<?php
/**
 * Accounts, Income, Expense, Salary, and Balance API Endpoint (Sprint 3)
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';
require_once __DIR__ . '/finance-domain.php';
require_once __DIR__ . '/idempotency.php';

$pdo = Database::getConnection();
$admin = requireAdminToken($pdo);
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $type = $_GET['type'] ?? 'balance';
        if ($type === 'balance') {
            requireAdminPermission($admin, 'accounts', 'read');
            $stmt = $pdo->query("SELECT * FROM accounts ORDER BY id ASC");
            $accounts = $stmt->fetchAll();
            $totalBalance = array_sum(array_column($accounts, 'balance'));
            jsonResponse(['status' => 'success', 'data' => ['accounts' => $accounts, 'total_balance' => $totalBalance]]);
        } elseif ($type === 'transactions') {
            requireAdminPermission($admin, 'accounts', 'transactions.read');
            $stmt = $pdo->query("SELECT t.*, a.name AS account_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id ORDER BY t.id DESC LIMIT 100");
            jsonResponse(['status' => 'success', 'data' => $stmt->fetchAll()]);
        } elseif ($type === 'salaries') {
            requireAdminPermission($admin, 'accounts', 'salaries.read');
            $stmt = $pdo->query("SELECT * FROM employee_salaries ORDER BY id DESC");
            jsonResponse(['status' => 'success', 'data' => $stmt->fetchAll()]);
        } else {
            jsonResponse(['error' => 'Invalid accounts report type'], 400);
        }
        break;

    case 'POST':
        $data = getRequestBody();
        $action = $data['action'] ?? 'add_transaction';

        if ($action === 'add_transaction') {
            requireAdminPermission($admin, 'accounts', 'transactions.create');
            $accountId = parseFinancialId($data['account_id'] ?? null);
            $type = is_string($data['type'] ?? null) ? $data['type'] : '';
            $amount = normalizeMoneyAmount($data['amount'] ?? null);
            $categoryValid = !array_key_exists('category', $data) || is_string($data['category']);
            $notesValid = !array_key_exists('notes', $data) || is_string($data['notes']);
            $category = !array_key_exists('category', $data) ? 'General' : ($categoryValid ? trim($data['category']) : '');
            $notes = !array_key_exists('notes', $data) ? '' : ($notesValid ? trim($data['notes']) : '');

            if ($accountId === null
                || !in_array($type, ['Income', 'Expense'], true)
                || $amount === null
                || moneyToMinorUnits($amount) < 1
                || !$categoryValid
                || !$notesValid
                || $category === ''
                || strlen($category) > 100
                || strlen($notes) > 2000) {
                jsonResponse(['error' => 'Enter a valid account, income or expense type, positive amount, and transaction description.'], 422);
            }
            enforceApiRateLimit($pdo, 'account_mutation', 60, 900);
            $idempotencyKey = requireIdempotencyKey();
            $requestPayload = [
                'account_id' => $accountId,
                'type' => $type,
                'amount' => $amount,
                'category' => $category,
                'notes' => $notes
            ];

            try {
                $pdo->beginTransaction();
                reserveIdempotency($pdo, (int)$admin['id'], 'accounts.transaction', $idempotencyKey, $requestPayload);
                $lock = $pdo->getAttribute(PDO::ATTR_DRIVER_NAME) === 'mysql' ? ' FOR UPDATE' : '';
                $accountStmt = $pdo->prepare('SELECT id, balance FROM accounts WHERE id = ?' . $lock);
                $accountStmt->execute([$accountId]);
                $account = $accountStmt->fetch();
                if (!$account) {
                    $pdo->rollBack();
                    jsonResponse(['error' => 'Account not found.'], 404);
                }

                $stmt = $pdo->prepare("INSERT INTO transactions (account_id, type, amount, category, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->execute([$accountId, $type, $amount, $category, $notes, (int)$admin['id']]);

                $balanceExpression = $type === 'Income' ? 'balance + ?' : 'balance - ?';
                $upd = $pdo->prepare('UPDATE accounts SET balance = ' . $balanceExpression . ' WHERE id = ?');
                $upd->execute([$amount, $accountId]);
                if ($upd->rowCount() !== 1) {
                    throw new RuntimeException('Account balance update did not affect exactly one account.');
                }

                $transactionId = (int)$pdo->lastInsertId();
                logAuditRequired(
                    $pdo,
                    (int)$admin['id'],
                    'create',
                    'transaction',
                    $transactionId,
                    ['account_id' => $accountId, 'balance' => (string)$account['balance']],
                    ['type' => $type, 'amount' => $amount, 'category' => $category, 'account_id' => $accountId]
                );
                $response = ['status' => 'success', 'message' => 'Transaction recorded successfully.'];
                completeIdempotency($pdo, (int)$admin['id'], 'accounts.transaction', $idempotencyKey, $response);
                $pdo->commit();
                jsonResponse($response);
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                error_log('Shopademia account transaction failed: ' . $e->getMessage());
                jsonResponse(['error' => 'Could not record transaction. Please try again.'], 500);
            }
        } elseif ($action === 'pay_salary') {
            requireAdminPermission($admin, 'accounts', 'salaries.pay');
            $empName = is_string($data['employee_name'] ?? null) ? trim($data['employee_name']) : '';
            $designationValid = !array_key_exists('designation', $data) || is_string($data['designation']);
            $monthValid = !array_key_exists('month', $data) || is_string($data['month']);
            $designation = !array_key_exists('designation', $data) ? '' : ($designationValid ? trim($data['designation']) : '');
            $baseSalary = normalizeMoneyAmount($data['base_salary'] ?? null);
            $advance = normalizeMoneyAmount($data['advance_paid'] ?? 0);
            $deductions = normalizeMoneyAmount($data['deductions'] ?? 0);
            $month = !array_key_exists('month', $data) ? gmdate('Y-m') : ($monthValid ? trim($data['month']) : '');

            if ($baseSalary === null || $advance === null || $deductions === null) {
                jsonResponse(['error' => 'Salary values must be valid non-negative amounts with no more than two decimal places.'], 422);
            }
            $baseCents = moneyToMinorUnits($baseSalary);
            $advanceCents = moneyToMinorUnits($advance);
            $deductionCents = moneyToMinorUnits($deductions);
            $netCents = $baseCents - $advanceCents - $deductionCents;
            if ($empName === ''
                || strlen($empName) > 150
                || !$designationValid
                || strlen($designation) > 100
                || !$monthValid
                || !preg_match('/\A[0-9]{4}-(0[1-9]|1[0-2])\z/', $month)
                || $advanceCents + $deductionCents > $baseCents
                || $netCents <= 0) {
                jsonResponse(['error' => 'Valid employee name and net salary amount required.'], 422);
            }

            enforceApiRateLimit($pdo, 'account_mutation', 60, 900);
            $netPaid = sprintf('%d.%02d', intdiv($netCents, 100), $netCents % 100);
            $idempotencyKey = requireIdempotencyKey();
            $requestPayload = [
                'employee_name' => $empName,
                'designation' => $designation,
                'base_salary' => $baseSalary,
                'advance_paid' => $advance,
                'deductions' => $deductions,
                'month' => $month
            ];
            try {
                $pdo->beginTransaction();
                reserveIdempotency($pdo, (int)$admin['id'], 'accounts.salary', $idempotencyKey, $requestPayload);
                $stmt = $pdo->prepare("INSERT INTO employee_salaries (employee_name, designation, base_salary, advance_paid, deductions, net_paid, month) VALUES (?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$empName, $designation, $baseSalary, $advance, $deductions, $netPaid, $month]);
                $salaryId = (int)$pdo->lastInsertId();
                logAuditRequired(
                    $pdo,
                    (int)$admin['id'],
                    'create',
                    'employee_salary',
                    $salaryId,
                    null,
                    ['employee_name' => $empName, 'month' => $month, 'net_paid' => $netPaid]
                );
                $response = ['status' => 'success', 'message' => 'Salary record saved.'];
                completeIdempotency($pdo, (int)$admin['id'], 'accounts.salary', $idempotencyKey, $response);
                $pdo->commit();
            } catch (Throwable $e) {
                if ($pdo->inTransaction()) {
                    $pdo->rollBack();
                }
                error_log('Shopademia salary record failed: ' . $e->getMessage());
                jsonResponse(['error' => 'Could not save salary record. Please try again.'], 500);
            }

            jsonResponse($response);
        } else {
            jsonResponse(['error' => 'Invalid action'], 400);
        }
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
