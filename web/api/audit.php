<?php
/**
 * Immutable Audit Logger (ADM-04, GAP-02)
 */

function logAudit(PDO $pdo, ?int $adminId, string $action, string $entityType, ?int $entityId, ?array $oldValues, ?array $newValues): void {
    $ip = $_SERVER['REMOTE_ADDR'] ?? 'unknown';
    try {
        $stmt = $pdo->prepare("
            INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, old_values, new_values, ip_address)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        ");
        $stmt->execute([
            $adminId,
            $action,
            $entityType,
            $entityId,
            $oldValues ? json_encode($oldValues) : null,
            $newValues ? json_encode($newValues) : null,
            $ip
        ]);
    } catch (PDOException $e) {
        error_log('Wonderful Collection audit log insertion failed: ' . $e->getMessage());
    }
}
