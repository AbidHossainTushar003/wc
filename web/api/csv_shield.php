<?php
/**
 * CSV Formula Injection Prevention (ADM-06, GAP-10, UNI-06)
 */

function sanitizeCsvCell(mixed $value): string {
    $str = (string)$value;
    if ($str !== '' && in_array($str[0], ['=', '+', '-', '@'], true)) {
        return "'" . $str;
    }
    return $str;
}
