<?php
/**
 * Accounts, Income, Expense, Salary, and Balance API Endpoint (Sprint 3)
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/audit.php';

$pdo = Database::getConnection();
$admin = requireAdminToken($pdo);
$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'GET':
        $type = $_GET['type'] ?? 'balance';
        if ($type === 'balance') {
            $stmt = $pdo->query("SELECT * FROM accounts ORDER BY id ASC");
            $accounts = $stmt->fetchAll();
            $totalBalance = array_sum(array_column($accounts, 'balance'));
            jsonResponse(['status' => 'success', 'data' => ['accounts' => $accounts, 'total_balance' => $totalBalance]]);
        } elseif ($type === 'transactions') {
            $stmt = $pdo->query("SELECT t.*, a.name AS account_name FROM transactions t LEFT JOIN accounts a ON t.account_id = a.id ORDER BY t.id DESC LIMIT 100");
            jsonResponse(['status' => 'success', 'data' => $stmt->fetchAll()]);
        } elseif ($type === 'salaries') {
            if ($admin['role'] !== 'Super Admin') {
                jsonResponse(['error' => 'Employee salary statements are restricted to the owner.'], 403);
            }
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
            $accountId = (int)($data['account_id'] ?? 1);
            $type = $data['type'] ?? 'Expense';
            $amount = (float)($data['amount'] ?? 0);
            $category = trim($data['category'] ?? 'General');
            $notes = trim($data['notes'] ?? '');

            if ($amount <= 0) {
                jsonResponse(['error' => 'Transaction amount must be greater than zero.'], 422);
            }

            try {
                $pdo->beginTransaction();
                $stmt = $pdo->prepare("INSERT INTO transactions (account_id, type, amount, category, notes, created_by) VALUES (?, ?, ?, ?, ?, ?)");
                $stmt->execute([$accountId, $type, $amount, $category, $notes, (int)$admin['id']]);

                $multiplier = ($type === 'Income') ? 1 : -1;
                $upd = $pdo->prepare("UPDATE accounts SET balance = balance + (?) WHERE id = ?");
                $upd->execute([$amount * $multiplier, $accountId]);

                logAudit($pdo, (int)$admin['id'], 'create', 'transaction', (int)$pdo->lastInsertId(), null, $data);
                $pdo->commit();
                jsonResponse(['status' => 'success', 'message' => 'Transaction recorded successfully.']);
            } catch (Exception $e) {
                if ($pdo->inTransaction()) $pdo->rollBack();
                jsonResponse(['error' => 'Could not record transaction: ' . $e->getMessage()], 500);
            }
        } elseif ($action === 'pay_salary') {
            if ($admin['role'] !== 'Super Admin') {
                jsonResponse(['error' => 'Only the owner can process employee salaries.'], 403);
            }
            $empName = trim($data['employee_name'] ?? '');
            $designation = trim($data['designation'] ?? '');
            $baseSalary = (float)($data['base_salary'] ?? 0);
            $advance = (float)($data['advance_paid'] ?? 0);
            $deductions = (float)($data['deductions'] ?? 0);
            $netPaid = $baseSalary - $advance - $deductions;
            $month = trim($data['month'] ?? date('Y-m'));

            if ($empName === '' || $netPaid <= 0) {
                jsonResponse(['error' => 'Valid employee name and net salary amount required.'], 422);
            }

            $stmt = $pdo->prepare("INSERT INTO employee_salaries (employee_name, designation, base_salary, advance_paid, deductions, net_paid, month) VALUES (?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$empName, $designation, $baseSalary, $advance, $deductions, $netPaid, $month]);
            logAudit($pdo, (int)$admin['id'], 'create', 'employee_salary', (int)$pdo->lastInsertId(), null, $data);

            jsonResponse(['status' => 'success', 'message' => 'Salary record saved.']);
        } else {
            jsonResponse(['error' => 'Invalid action'], 400);
        }
        break;

    default:
        jsonResponse(['error' => 'Method not allowed'], 405);
}
