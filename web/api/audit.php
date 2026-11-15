<?php
/**
 * Immutable Audit Logger (ADM-04, GAP-02)
 */

function logAudit(PDO $pdo, ?int $adminId, string $action, string $entityType, ?int $entityId, ?array $oldValues, ?array $newValues): void {
    logAuditRequired($pdo, $adminId, $action, $entityType, $entityId, $oldValues, $newValues);
}

function logAuditRequired(PDO $pdo, ?int $adminId, string $action, string $entityType, ?int $entityId, ?array $oldValues, ?array $newValues): void {
    $oldJson = $oldValues === null ? null : json_encode($oldValues);
    $newJson = $newValues === null ? null : json_encode($newValues);
    if (($oldValues !== null && $oldJson === false) || ($newValues !== null && $newJson === false)) {
        throw new RuntimeException('Audit values could not be encoded.');
    }

    $stmt = $pdo->prepare("
        INSERT INTO audit_logs (admin_id, action, entity_type, entity_id, old_values, new_values, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
    ");
    $stmt->execute([
        $adminId,
        $action,
        $entityType,
        $entityId,
        $oldJson,
        $newJson,
        $_SERVER['REMOTE_ADDR'] ?? 'unknown'
    ]);
}
