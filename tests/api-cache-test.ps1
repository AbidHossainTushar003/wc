param(
    [uri]$BaseUri = 'https://wonderfulcollection.store'
)

$ErrorActionPreference = 'Stop'
$uri = [uri]::new($BaseUri, '/api/products')
try {
    $response = Invoke-WebRequest -Uri $uri -Method Get -Headers @{ Accept = 'application/json' }
    $cacheControl = [string]$response.Headers['Cache-Control']
    if ($response.StatusCode -ne 200 -or $cacheControl -notmatch '(?i)\bno-store\b') {
        Write-Output "FAIL /api/products status=$($response.StatusCode) Cache-Control='$cacheControl'"
        exit 1
    }
    Write-Output "PASS /api/products is 200 with Cache-Control: $cacheControl"
}
catch {
    Write-Output "FAIL API cache check: $($_.Exception.Message)"
    exit 1
}
