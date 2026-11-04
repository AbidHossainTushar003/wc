<?php
/**
 * Error Tracking and Alerting Helper (PRD-12)
 */

function trackException(Throwable $e, string $context = ''): void {
    $errorMsg = sprintf(
        '[%s UTC] [ERROR_TRACKER] Context: %s | Message: %s | File: %s:%d',
        gmdate('Y-m-d H:i:s'),
        $context,
        $e->getMessage(),
        $e->getFile(),
        $e->getLine()
    );
    error_log($errorMsg);
}
