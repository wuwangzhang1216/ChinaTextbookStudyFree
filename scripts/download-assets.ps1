# Install or upgrade every resource package with SHA-256 verification.
param([string]$Tag = "v1.8.0")
$ErrorActionPreference = "Stop"
$RootDir = Split-Path -Parent $PSScriptRoot
$Installer = Join-Path $PSScriptRoot "install-release.py"
if (Get-Command py -ErrorAction SilentlyContinue) {
    & py -3 $Installer --tag $Tag --root $RootDir
} elseif (Get-Command python -ErrorAction SilentlyContinue) {
    & python $Installer --tag $Tag --root $RootDir
} else {
    throw "Please install Python 3.9+ and add it to PATH."
}
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
