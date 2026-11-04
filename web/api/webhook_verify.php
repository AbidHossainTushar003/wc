<?php
/**
 * Webhook Signature Verification Helper (SEC-21, CFG-2)
 */

function verifyWebhookSignature(string $rawBody, string $signatureHeader, string $secret): bool {
    if ($signatureHeader === '' || $secret === '') {
        return false;
    }
    $expected = hash_hmac('sha256', $rawBody, $secret);
    return hash_equals($expected, trim($signatureHeader));
}
