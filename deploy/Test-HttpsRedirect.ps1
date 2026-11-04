$ErrorActionPreference = 'Stop'

$urls = @(
    'http://wonderfulcollection.store/',
    'http://wonderfulcollection.store/api/products'
)
$failed = $false

foreach ($url in $urls) {
    Write-Output "Checking $url"
    $headers = & curl.exe -sS -I --max-redirs 0 --connect-timeout 15 $url 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Output "FAIL: curl failed for $url`: $($headers -join ' ')"
        $failed = $true
        continue
    }

    $statusHeaders = @($headers | Select-String -Pattern '^HTTP/\S+\s+\d{3}')
    $locationHeaders = @($headers | Select-String -Pattern '^Location:\s*(.+)$' -CaseSensitive:$false)
    if ($statusHeaders.Count -eq 0) {
        Write-Output "FAIL: no HTTP status was returned for $url."
        $failed = $true
        continue
    }

    $statusMatch = [regex]::Match($statusHeaders[-1].Line, '^HTTP/\S+\s+(\d{3})')
    $status = [int]$statusMatch.Groups[1].Value
    $location = ''
    if ($locationHeaders.Count -gt 0) {
        $locationMatch = [regex]::Match($locationHeaders[-1].Line, '^Location:\s*(.+)$', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        $location = $locationMatch.Groups[1].Value.Trim()
    }
    $destination = $null
    $isHttpsLocation = [uri]::TryCreate($location, [System.UriKind]::Absolute, [ref]$destination)
    if ($isHttpsLocation) {
        $isHttpsLocation = $destination.Scheme -eq 'https' -and $destination.Host -eq 'wonderfulcollection.store'
    }

    if (($status -eq 301 -or $status -eq 308) -and $isHttpsLocation) {
        Write-Output "PASS: HTTP $status -> $location"
    } else {
        Write-Output "FAIL: expected HTTP 301/308 to https://wonderfulcollection.store; received HTTP $status and Location '$location'."
        $failed = $true
    }
}

if ($failed) {
    exit 1
}

Write-Output 'All HTTP-to-HTTPS redirect checks passed.'
