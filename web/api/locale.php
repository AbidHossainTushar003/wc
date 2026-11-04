<?php
/**
 * Bangladesh Locale, Currency, and Phone Normalization Helpers (PRD-18)
 */

function normalizeBdPhone(string $phone): string {
    $clean = preg_replace('/[^0-9+]/', '', trim($phone));
    if (str_starts_with($clean, '+880')) {
        $clean = substr($clean, 4);
    } elseif (str_starts_with($clean, '880')) {
        $clean = substr($clean, 3);
    }
    if (str_starts_with($clean, '0')) {
        $clean = substr($clean, 1);
    }
    if (strlen($clean) === 9 && str_starts_with($clean, '1')) {
        return '+8801' . $clean;
    }
    return trim($phone);
}

function formatBdt(float $amount): string {
    return '৳ ' . number_format($amount, 2);
}
