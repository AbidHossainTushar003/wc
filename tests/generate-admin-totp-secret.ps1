$alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
$bytes = New-Object byte[] 20
$rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
    $rng.GetBytes($bytes)
    $buffer = 0
    $bitCount = 0
    $secret = ''
    foreach ($byte in $bytes) {
        $buffer = ($buffer -shl 8) -bor [int]$byte
        $bitCount += 8
        while ($bitCount -ge 5) {
            $bitCount -= 5
            $secret += $alphabet[($buffer -shr $bitCount) -band 31]
            $buffer = $buffer -band ((1 -shl $bitCount) - 1)
        }
    }
    if ($bitCount -gt 0) {
        $secret += $alphabet[($buffer -shl (5 - $bitCount)) -band 31]
    }
    Write-Output $secret
}
finally {
    $rng.Dispose()
    [Array]::Clear($bytes, 0, $bytes.Length)
}
