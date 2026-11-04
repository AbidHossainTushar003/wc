<?php

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/mail.php';

$pdo = Database::getConnection();
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    jsonResponse(['error' => 'Method not allowed'], 405);
}

enforceApiRateLimit($pdo, 'contact', 5, 900);
$data = getRequestBody();
$name = trim(is_string($data['name'] ?? null) ? $data['name'] : '');
$phone = trim(is_string($data['phone'] ?? null) ? $data['phone'] : '');
$subject = trim(is_string($data['subject'] ?? null) ? $data['subject'] : '');
$message = trim(is_string($data['message'] ?? null) ? $data['message'] : '');
$website = is_string($data['website'] ?? null) ? trim($data['website']) : '';

if ($website !== '') {
    jsonResponse(['status' => 'success', 'message' => 'Your message has been received.']);
}
if ($name === '' || strlen($name) > 150
    || !preg_match('/^\+?[0-9][0-9\s()-]{6,28}$/', $phone)
    || strlen($subject) > 200
    || $message === '' || strlen($message) > 4000
    || preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $name . $phone . $subject . $message)) {
    jsonResponse(['error' => 'Enter a valid name, phone number, and message.'], 422);
}

$recipient = getMailToAddress();
$sender = getMailFromAddress();
if (!filter_var($recipient, FILTER_VALIDATE_EMAIL) || !filter_var($sender, FILTER_VALIDATE_EMAIL)) {
    jsonResponse(['error' => 'Contact messaging is not configured. Please contact the store by phone or WhatsApp.'], 503);
}

$body = "New contact message\n\n"
    . "Name: {$name}\n"
    . "Phone: {$phone}\n"
    . "Subject: {$subject}\n\n"
    . "Message:\n{$message}\n";
if (!sendStoreMail($recipient, 'Wonderful Collection contact message', $body)) {
    error_log('Wonderful Collection contact email delivery failed.');
    jsonResponse(['error' => 'We could not send your message right now. Please contact the store by phone or WhatsApp.'], 503);
}

jsonResponse(['status' => 'success', 'message' => 'Your message was sent to the store.']);
