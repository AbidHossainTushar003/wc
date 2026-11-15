param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'wonderful-deploy.zip'),
    [string]$ManifestPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $repositoryRoot 'web'
$configTemplate = Join-Path $PSScriptRoot 'config.local.php.template'
$outputPath = [System.IO.Path]::GetFullPath($OutputPath)
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
    $ManifestPath = "$outputPath.manifest.json"
}
$manifestPath = [System.IO.Path]::GetFullPath($ManifestPath)
$webRoot = [System.IO.Path]::GetFullPath($webRoot)
$webPrefix = $webRoot.TrimEnd([char[]]@('\', '/')) + [System.IO.Path]::DirectorySeparatorChar

if (-not (Test-Path -LiteralPath $webRoot -PathType Container)) {
    throw "Web root not found: $webRoot"
}
if (-not (Test-Path -LiteralPath $configTemplate -PathType Leaf)) {
    throw "Config template not found: $configTemplate"
}
if ([string]::Equals($outputPath, $manifestPath, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Package and manifest output paths must be different.'
}
if ($outputPath.StartsWith($webPrefix, [System.StringComparison]::OrdinalIgnoreCase) -or
    $manifestPath.StartsWith($webPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Package and manifest outputs must be outside the public web root.'
}
if (Test-Path -LiteralPath $outputPath) {
    throw "Output already exists. Choose a new OutputPath: $outputPath"
}
if (Test-Path -LiteralPath $manifestPath) {
    throw "Manifest already exists. Choose a new ManifestPath: $manifestPath"
}

$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("wonderful-deploy-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stagingRoot | Out-Null

try {
    Get-ChildItem -LiteralPath $webRoot -Recurse -File -Force | ForEach-Object {
        $relativePath = $_.FullName.Substring($webRoot.Length).TrimStart([char[]]@('\', '/'))
        $segments = $relativePath -split '[\\/]'
        $excludedSegment = $segments | Where-Object {
            $_ -in @('.git', 'node_modules', 'admin-android', 'backup', 'backups', 'logs', 'tests', 'fixtures', 'staging', '_to_delete')
        } | Select-Object -First 1
        if ($null -ne $excludedSegment) {
            return
        }
        $forbiddenExtension = $_.Extension -in @(
            '.sqlite', '.db', '.sql', '.zip', '.7z', '.rar', '.tar', '.gz', '.bz2', '.xz',
            '.bak', '.backup', '.dump', '.log', '.pem', '.key', '.p12', '.pfx', '.cer', '.crt'
        )
        if ($_.Name -ieq 'config.local.php' -or
            $_.Name -match '(?i)^\.env(?:\.|$)' -or
            $_.Name -match '(?i)(^|[._-])(secret|credentials?)([._-]|$)' -or
            $forbiddenExtension -or
            $_.FullName -match '(?i)(?:electron|desktop-erp|admin-android)') {
            return
        }

        $destination = Join-Path $stagingRoot $relativePath
        $destinationDirectory = Split-Path -Parent $destination
        New-Item -ItemType Directory -Path $destinationDirectory -Force | Out-Null
        Copy-Item -LiteralPath $_.FullName -Destination $destination
    }

    $apiDirectory = Join-Path $stagingRoot 'api'
    New-Item -ItemType Directory -Path $apiDirectory -Force | Out-Null
    Copy-Item -LiteralPath $configTemplate -Destination (Join-Path $apiDirectory 'config.local.php.template')

    if (-not (Test-Path -LiteralPath (Join-Path $stagingRoot 'index.html') -PathType Leaf)) {
        throw 'Staged deployment is missing the root index.html.'
    }
    if (-not (Test-Path -LiteralPath (Join-Path $stagingRoot '.htaccess') -PathType Leaf)) {
        throw 'Staged deployment is missing the root .htaccess.'
    }

    $outputDirectory = Split-Path -Parent $outputPath
    New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
    if (Test-Path -LiteralPath $outputPath) {
        Remove-Item -LiteralPath $outputPath -Force
    }

    Add-Type -AssemblyName System.IO.Compression
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $stream = [System.IO.File]::Open($outputPath, [System.IO.FileMode]::CreateNew)
    $zip = [System.IO.Compression.ZipArchive]::new(
        $stream,
        [System.IO.Compression.ZipArchiveMode]::Create,
        $false
    )
    try {
        Get-ChildItem -LiteralPath $stagingRoot -Recurse -File -Force | ForEach-Object {
            $entryName = $_.FullName.Substring($stagingRoot.Length).TrimStart([char[]]@('\', '/')) -replace '\\', '/'
            [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
                $zip,
                $_.FullName,
                $entryName,
                [System.IO.Compression.CompressionLevel]::Optimal
            ) | Out-Null
        }
    }
    finally {
        $zip.Dispose()
        $stream.Dispose()
    }

    $archive = [System.IO.Compression.ZipFile]::OpenRead($outputPath)
    try {
        $entryNames = @($archive.Entries | ForEach-Object { $_.FullName })
        foreach ($requiredEntry in @('index.html', '.htaccess', 'api/config.local.php.template')) {
            if ($entryNames -notcontains $requiredEntry) {
                throw "Deployment archive is missing $requiredEntry."
            }
        }
        $forbiddenEntry = $entryNames | Where-Object {
            $_ -match '(^|/)(\.git|node_modules|admin-android)(/|$)' -or
            $_ -match '(?i)(\.sqlite|\.db|\.sql|\.zip|\.7z|\.rar|\.tar|\.gz|\.bz2|\.xz|\.bak|\.backup|\.dump|\.log|\.pem|\.key|\.p12|\.pfx|\.cer|\.crt|\.md)$' -or
            $_ -match '(?i)(^|/)\.env(?:\.|$)' -or
            $_ -match '(?i)(^|/)[^/]*([._-])(secret|credentials?)([._-]|[^/]*$)' -or
            $_ -match '(^|/)config\.local\.php$' -or
            $_ -match '(^|/)server\.js$|(^|/)dev-data\.json$' -or
            $_ -match '(^|/)\.\.(/|$)' -or
            $_ -match '^(?:/|[A-Za-z]:)'
        } | Select-Object -First 1
        if ($forbiddenEntry) {
            throw "Deployment archive contains a forbidden file: $forbiddenEntry"
        }
    }
    finally {
        $archive.Dispose()
    }

    $manifestEntries = @(
        Get-ChildItem -LiteralPath $stagingRoot -Recurse -File -Force | ForEach-Object {
            $relativePath = $_.FullName.Substring($stagingRoot.Length).TrimStart([char[]]@('\', '/')) -replace '\\', '/'
            [pscustomobject]@{
                path = $relativePath
                size = $_.Length
                sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
            }
        }
    )
    $packageHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $outputPath).Hash
    [pscustomobject]@{
        generated_at_utc = [DateTime]::UtcNow.ToString('o')
        package = [System.IO.Path]::GetFileName($outputPath)
        package_sha256 = $packageHash
        entries = $manifestEntries
    } | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $manifestPath -Encoding UTF8

    Write-Output "Deployment archive created and checked: $outputPath"
    Write-Output "Package manifest created: $manifestPath"
    Write-Output "Package SHA-256: $packageHash"
}
finally {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
