# ZIP del proyecto en la raíz, sin dependencias, builds ni insumos privados (data/).
# Uso: powershell -ExecutionPolicy Bypass -File scripts/make-zip.ps1 -Name walkthrough-fase1
param([Parameter(Mandatory = $true)][string]$Name)

$root = Split-Path -Parent $PSScriptRoot
$zip = Join-Path $root "$Name.zip"
if (Test-Path $zip) { Remove-Item $zip -Force -Confirm:$false }

Push-Location $root
try {
    & "$env:SystemRoot\System32\tar.exe" -a -c -f "$Name.zip" `
        --exclude=node_modules --exclude=dist --exclude=./data `
        --exclude=*.zip --exclude=*.tsbuildinfo --exclude=__pycache__ --exclude=.pytest_cache `
        --exclude=./viewer/public/textures --exclude=./viewer/public/hdri --exclude=./viewer/public/models .
    if ($LASTEXITCODE -ne 0) { throw "tar falló con código $LASTEXITCODE" }
    Get-Item $zip | Select-Object Name, @{ n = 'KB'; e = { [math]::Round($_.Length / 1KB) } }
}
finally {
    Pop-Location
}
