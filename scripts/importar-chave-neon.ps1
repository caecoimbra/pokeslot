# Importa uma chave criada para o projeto de prova para o cofre do Windows.
# A chave e lida da area de transferencia apenas apos sua confirmacao no PowerShell.
$ErrorActionPreference = 'Stop'
$Host.UI.RawUI.WindowTitle = 'PokeSlot - importar chave de teste'
$pnpmPath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\fallback\pnpm.cmd'
if (-not (Test-Path -LiteralPath $pnpmPath)) {
    $pnpm = Get-Command pnpm -ErrorAction Stop
    $pnpmPath = $pnpm.Source
}
Write-Host 'Copie a chave do projeto na Neon. Depois volte a esta janela e aperte Enter.'
[void](Read-Host 'Pressione Enter somente depois de copiar a chave')
try {
    $plainKey = (Get-Clipboard -Raw -Format Text).Trim()
    if ($plainKey.Length -lt 20 -or $plainKey.Length -gt 512 -or $plainKey -notmatch '^[!-~]+$') {
        throw 'A area de transferencia nao parece conter uma chave. Copie a chave na Neon e tente novamente.'
    }
    $plainKey | & $pnpmPath dlx neon@8.11.0 profile create pokeslot-proof --keyring --api-key -
    if ($LASTEXITCODE -ne 0) { throw 'A CLI nao confirmou a criacao do perfil.' }
    Write-Host 'Perfil criado. Volte ao chat e informe que concluiu.'
} finally {
    $plainKey = $null
}
