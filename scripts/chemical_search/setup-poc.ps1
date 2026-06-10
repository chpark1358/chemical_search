param(
  [string]$VenvPath = ".venv-chemical"
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..\..")).Path
$venv = Join-Path $projectRoot $VenvPath
$requirements = Join-Path $PSScriptRoot "requirements-poc.txt"

Push-Location -LiteralPath $projectRoot
try {
  if (-not (Test-Path -LiteralPath $venv)) {
    py -3.11 -m venv $venv
  }

  $python = Join-Path $venv "Scripts\python.exe"
  & $python -m pip install --upgrade pip
  & $python -m pip install -r $requirements
  & $python -m unittest discover -s tests -p "test*.py" -v
} finally {
  Pop-Location
}
