param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'wonderful-deploy.zip'),
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$webRoot = Join-Path $repositoryRoot 'web'
$configTemplate = Join-Path $PSScriptRoot 'config.local.php.template'
$outputPath = [System.IO.Path]::GetFullPath($OutputPath)

if (-not (Test-Path -LiteralPath $webRoot -PathType Container)) {
    throw "Web root not found: $webRoot"
}
if (-not (Test-Path -LiteralPath $configTemplate -PathType Leaf)) {
    throw "Config template not found: $configTemplate"
}
if ((Test-Path -LiteralPath $outputPath) -and -not $Force) {
    throw "Output already exists. Choose another OutputPath or pass -Force: $outputPath"
}

$stagingRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("wonderful-deploy-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stagingRoot | Out-Null

try {
    Get-ChildItem -LiteralPath $webRoot -Recurse -File -Force | ForEach-Object {
        $relativePath = $_.FullName.Substring($webRoot.Length).TrimStart([char[]]@('\', '/'))
        $segments = $relativePath -split '[\\/]'
        $excludedSegment = $segments | Where-Object { $_ -in @('.git', 'node_modules', 'admin-android') } | Select-Object -First 1
        if ($null -ne $excludedSegment) {
            return
        }
        if ($_.Name -ieq 'config.local.php' -or $_.Extension -in @('.sqlite', '.sql', '.md')) {
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
            $_ -match '(?i)(\.sqlite|\.sql|\.md)$' -or
            $_ -match '(^|/)config\.local\.php$' -or
            $_ -match '(^|/)server\.js$|(^|/)dev-data\.json$'
        } | Select-Object -First 1
        if ($forbiddenEntry) {
            throw "Deployment archive contains a forbidden file: $forbiddenEntry"
        }
    }
    finally {
        $archive.Dispose()
    }

    Write-Output "Deployment archive created and checked: $outputPath"
}
finally {
    Remove-Item -LiteralPath $stagingRoot -Recurse -Force
}
