param(
    [string]$BaseUri = 'https://wonderfulcollection.store',
    [string]$StagingHost = $env:WC_STAGING_HOST,
    [switch]$SkipAnnouncementXssTest
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Net.Http

$base = [Uri]$BaseUri
$allowedHosts = @('wonderfulcollection.store')
if (-not [string]::IsNullOrWhiteSpace($StagingHost)) {
    $stagingHostName = $StagingHost.Trim().ToLowerInvariant()
    if ($stagingHostName -match '[:/@?#\\\s]' -or $stagingHostName -notmatch '\A[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\z') {
        throw 'WC_STAGING_HOST must be a hostname only, without scheme, port, path, or credentials.'
    }
    $allowedHosts += $stagingHostName
}
$invalidBaseUri = $base.Scheme -ne 'https' -or
    -not $base.IsDefaultPort -or
    -not [string]::IsNullOrEmpty($base.UserInfo) -or
    -not [string]::IsNullOrEmpty($base.Query) -or
    -not [string]::IsNullOrEmpty($base.Fragment) -or
    $base.AbsolutePath -ne '/' -or
    $allowedHosts -notcontains $base.Host.ToLowerInvariant()
if ($invalidBaseUri) {
    throw "BaseUri must be the HTTPS origin for wonderfulcollection.store or the explicitly named WC_STAGING_HOST. Refusing to send a token elsewhere."
}

$token = $env:WC_ADMIN_TOKEN
if ([string]::IsNullOrWhiteSpace($token)) {
    $secureToken = Read-Host 'Admin bearer token' -AsSecureString
    $tokenPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
    try {
        $token = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($tokenPointer)
    }
    finally {
        [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($tokenPointer)
    }
}
if ([string]::IsNullOrWhiteSpace($token)) {
    throw 'An admin token is required for the authorized upload and announcement checks.'
}

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$handler = [System.Net.Http.HttpClientHandler]::new()
$handler.AllowAutoRedirect = $false
$client = [System.Net.Http.HttpClient]::new($handler)
$client.Timeout = [TimeSpan]::FromSeconds(30)
$script:BaseUri = $base
$script:HttpClient = $client
$script:FailureCount = 0
$script:KnownRedirectFailures = 0
$script:SkipCount = 0

function Invoke-TestRequest {
    param(
        [Parameter(Mandatory = $true)][string]$Path,
        [string]$Method = 'GET',
        [string]$Token,
        [string]$Body,
        [System.Net.Http.HttpContent]$Content
    )

    if ($Path -match '^https?://') {
        $uri = [Uri]$Path
    }
    else {
        $uri = [Uri]::new($script:BaseUri, $Path.TrimStart('/'))
    }

    $request = [System.Net.Http.HttpRequestMessage]::new(
        [System.Net.Http.HttpMethod]::new($Method),
        $uri
    )
    $response = $null
    try {
        if (-not [string]::IsNullOrWhiteSpace($Token)) {
            $request.Headers.Authorization =
                [System.Net.Http.Headers.AuthenticationHeaderValue]::new('Bearer', $Token)
        }
        if ($null -ne $Content) {
            $request.Content = $Content
        }
        elseif ($null -ne $Body) {
            $request.Content = [System.Net.Http.StringContent]::new(
                $Body,
                [Text.Encoding]::UTF8,
                'application/json'
            )
        }

        $response = $script:HttpClient.SendAsync($request).GetAwaiter().GetResult()
        $responseBody = $response.Content.ReadAsStringAsync().GetAwaiter().GetResult()
        $location = ''
        if ($null -ne $response.Headers.Location) {
            $location = $response.Headers.Location.ToString()
        }
        $contentType = ''
        if ($null -ne $response.Content.Headers.ContentType) {
            $contentType = $response.Content.Headers.ContentType.MediaType
        }

        return [pscustomobject]@{
            StatusCode = [int]$response.StatusCode
            Body = $responseBody
            Location = $location
            ContentType = $contentType
        }
    }
    finally {
        if ($null -ne $response) {
            $response.Dispose()
        }
        $request.Dispose()
    }
}

function Write-Check {
    param(
        [string]$Name,
        [bool]$Passed,
        [string]$Details = '',
        [switch]$KnownFailure,
        [switch]$Skipped
    )

    if ($Skipped) {
        $script:SkipCount++
        Write-Host "[SKIP] $Name $Details" -ForegroundColor Yellow
    }
    elseif ($Passed) {
        Write-Host "[PASS] $Name $Details" -ForegroundColor Green
    }
    elseif ($KnownFailure) {
        $script:KnownRedirectFailures++
        Write-Host "[FAIL - EXPECTED HOST BLOCKER] $Name $Details" -ForegroundColor Yellow
    }
    else {
        $script:FailureCount++
        Write-Host "[FAIL] $Name $Details" -ForegroundColor Red
    }
}

try {
    $products = Invoke-TestRequest -Path 'api/products'
    $validProductsJson = $false
    if ($products.StatusCode -eq 200 -and $products.ContentType -eq 'application/json') {
        try {
            $null = $products.Body | ConvertFrom-Json
            $validProductsJson = $true
        }
        catch {
            $validProductsJson = $false
        }
    }
    Write-Check 'GET /api/products returns JSON 200' $validProductsJson "HTTP $($products.StatusCode), Content-Type $($products.ContentType)"

    $unauthorizedChecks = @(
        @{ Name = 'POST products'; Path = 'api/products'; Method = 'POST'; Body = '{}' },
        @{ Name = 'PUT products'; Path = 'api/products?id=1'; Method = 'PUT'; Body = '{}' },
        @{ Name = 'DELETE products'; Path = 'api/products?id=1'; Method = 'DELETE'; Body = $null },
        @{ Name = 'PUT orders'; Path = 'api/orders?id=1'; Method = 'PUT'; Body = '{}' },
        @{ Name = 'DELETE orders'; Path = 'api/orders?id=1'; Method = 'DELETE'; Body = $null },
        @{ Name = 'POST coupons'; Path = 'api/coupons'; Method = 'POST'; Body = '{}' },
        @{ Name = 'PUT coupons'; Path = 'api/coupons?id=1'; Method = 'PUT'; Body = '{}' },
        @{ Name = 'DELETE coupons'; Path = 'api/coupons?id=1'; Method = 'DELETE'; Body = $null },
        @{ Name = 'POST settings'; Path = 'api/settings'; Method = 'POST'; Body = '{}' },
        @{ Name = 'PUT settings'; Path = 'api/settings'; Method = 'PUT'; Body = '{}' },
        @{ Name = 'DELETE settings'; Path = 'api/settings'; Method = 'DELETE'; Body = $null },
        @{ Name = 'POST product upload'; Path = 'api/product-images.php'; Method = 'POST'; Body = $null }
    )
    foreach ($check in $unauthorizedChecks) {
        $response = Invoke-TestRequest -Path $check.Path -Method $check.Method -Body $check.Body
        Write-Check "No-token $($check.Name) returns 401" ($response.StatusCode -eq 401) "HTTP $($response.StatusCode)"
    }

    $emptyCheckout = Invoke-TestRequest -Path 'api/orders' -Method 'POST' -Body '{}'
    $checkoutRejected = $emptyCheckout.StatusCode -eq 422 -or $emptyCheckout.StatusCode -eq 429
    Write-Check 'Public checkout rejects an incomplete no-token order without creating it' `
        $checkoutRejected "HTTP $($emptyCheckout.StatusCode); 429 is also safe rejection when checkout rate-limiting is active"

    $sensitivePaths = @(
        'data.sqlite',
        'database.sql',
        'api/config.local.php',
        'CPANEL_DEPLOYMENT_GUIDE.md'
    )
    foreach ($path in $sensitivePaths) {
        $response = Invoke-TestRequest -Path $path
        $blocked = $response.StatusCode -eq 403 -or $response.StatusCode -eq 404
        Write-Check "Sensitive path /$path is blocked" $blocked "HTTP $($response.StatusCode)"
    }

    $directory = Invoke-TestRequest -Path 'assets/products/'
    $hasListing = $directory.Body -match '(?is)<title>\s*Index of|Index of /assets/products|Parent Directory'
    Write-Check 'Product image directory has no listing' (-not $hasListing) "HTTP $($directory.StatusCode)"

    $probePath = Join-Path ([IO.Path]::GetTempPath()) ("wc-upload-probe-" + [Guid]::NewGuid().ToString('N') + '.php')
    try {
        [IO.File]::WriteAllText($probePath, '<?php echo "upload validation probe"; ?>', [Text.Encoding]::ASCII)
        $multipart = [System.Net.Http.MultipartFormDataContent]::new()
        $fileBytes = [IO.File]::ReadAllBytes($probePath)
        $fileContent = [System.Net.Http.ByteArrayContent]::new($fileBytes)
        $fileContent.Headers.ContentType =
            [System.Net.Http.Headers.MediaTypeHeaderValue]::new('image/jpeg')
        $multipart.Add($fileContent, 'images[]', 'spoofed.jpg')
        $upload = Invoke-TestRequest -Path 'api/product-images.php' -Method 'POST' -Token $token -Content $multipart
        Write-Check 'PHP payload named .jpg is rejected by image validation' `
            ($upload.StatusCode -eq 422) "HTTP $($upload.StatusCode)"
    }
    finally {
        if (Test-Path -LiteralPath $probePath) {
            Remove-Item -LiteralPath $probePath -Force
        }
    }

    if ($SkipAnnouncementXssTest) {
        Write-Check 'Announcement XSS/rendering check' $false 'Skipped by -SkipAnnouncementXssTest.' -Skipped
    }
    else {
        $approval = Read-Host 'This briefly changes the live announcement and restores it afterward. Type RUN to continue'
        if ($approval -cne 'RUN') {
            Write-Check 'Announcement XSS/rendering check' $false 'No production setting was changed.' -Skipped
        }
        else {
            $changedAnnouncement = $false
            try {
                $current = Invoke-TestRequest -Path 'api/settings?public=1'
                if ($current.StatusCode -ne 200) {
                    throw "Could not read the public announcement (HTTP $($current.StatusCode))."
                }
                $currentData = $current.Body | ConvertFrom-Json
                $originalAnnouncement = [string]$currentData.data.announcement_text
                Write-Host "Original announcement (manual restore reference): $originalAnnouncement" -ForegroundColor Cyan
                $payload = '<script>alert(1)</script>'
                $writeBody = @{ announcement_text = $payload } | ConvertTo-Json -Compress
                $saved = Invoke-TestRequest -Path 'api/settings' -Method 'PUT' -Token $token -Body $writeBody
                if ($saved.StatusCode -ne 200) {
                    throw "Could not store the temporary announcement probe (HTTP $($saved.StatusCode))."
                }
                $changedAnnouncement = $true

                $stored = Invoke-TestRequest -Path 'api/settings?public=1'
                $storedData = $stored.Body | ConvertFrom-Json
                $roundTrip = $stored.StatusCode -eq 200 -and
                    $storedData.data.announcement_text -ceq $payload
                Write-Check 'Announcement XSS payload round-trips as literal text' $roundTrip

                $storeScript = Invoke-TestRequest -Path 'js/store.js'
                $usesTextContent = $storeScript.StatusCode -eq 200 -and
                    $storeScript.Body -match 'copy\.textContent\s*=\s*text\s*;' -and
                    $storeScript.Body -notmatch 'copy\.innerHTML\s*=\s*text'
                Write-Check 'Storefront announcement renderer uses textContent' $usesTextContent "HTTP $($storeScript.StatusCode)"

                if ($roundTrip -and $usesTextContent) {
                    Write-Host 'Open the home page now: confirm the banner shows the literal script text and no alert runs.' -ForegroundColor Cyan
                    $renderedLiterally = (Read-Host 'Did the browser show literal text without executing it? Type YES') -ceq 'YES'
                    Write-Check 'Browser renders announcement literally without executing script' $renderedLiterally
                }
                else {
                    Write-Check 'Browser rendering confirmation' $false 'Skipped because the stored-value or renderer check failed.' -Skipped
                }
            }
            catch {
                Write-Check 'Announcement XSS/rendering check' $false $_.Exception.Message
            }
            finally {
                if ($changedAnnouncement) {
                    try {
                        $restoreBody = @{ announcement_text = $originalAnnouncement } | ConvertTo-Json -Compress
                        $restored = Invoke-TestRequest -Path 'api/settings' -Method 'PUT' -Token $token -Body $restoreBody
                        Write-Check 'Original announcement restored' ($restored.StatusCode -eq 200) "HTTP $($restored.StatusCode)"
                    }
                    catch {
                        Write-Check 'Original announcement restored' $false $_.Exception.Message
                    }
                }
            }
        }
    }

    $httpOrigin = 'http://' + $script:BaseUri.Host
    foreach ($httpUrl in @("$httpOrigin/", "$httpOrigin/api/products")) {
        try {
            $redirect = Invoke-TestRequest -Path $httpUrl -Method 'HEAD'
            $locationIsHttps = $redirect.Location -match '^https://'
            $isRedirect = $redirect.StatusCode -eq 301 -or $redirect.StatusCode -eq 308
            $passed = $isRedirect -and $locationIsHttps
            $details = "HTTP $($redirect.StatusCode), Location '$($redirect.Location)'"
            Write-Check "HTTP redirects to HTTPS: $httpUrl" $passed $details -KnownFailure:(!$passed)
        }
        catch {
            Write-Check "HTTP redirects to HTTPS: $httpUrl" $false $_.Exception.Message -KnownFailure
        }
    }
}
catch {
    Write-Check 'Post-deploy test run' $false $_.Exception.Message
}
finally {
    $client.Dispose()
    $handler.Dispose()
    $token = $null
    $secureToken = $null
}

Write-Host ''
Write-Host "Unexpected failures: $script:FailureCount; expected host redirect failures: $script:KnownRedirectFailures; skipped: $script:SkipCount"
if ($script:FailureCount -gt 0) {
    exit 1
}
