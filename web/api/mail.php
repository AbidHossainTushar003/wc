<?php

function getMailToAddress(): string {
    $mailTo = defined('MAIL_TO') ? MAIL_TO : getenv('MAIL_TO');
    return is_string($mailTo) ? trim($mailTo) : '';
}

function sendStoreMail(string $recipient, string $subject, string $body): bool {
    $sender = getMailFromAddress();
    if (!filter_var($recipient, FILTER_VALIDATE_EMAIL)
        || !filter_var($sender, FILTER_VALIDATE_EMAIL)
        || preg_match('/[\r\n]/', $subject)) {
        return false;
    }

    $headers = [
        'From: ' . $sender,
        'Content-Type: text/plain; charset=UTF-8'
    ];
    return mail($recipient, $subject, $body, implode("\r\n", $headers));
}
