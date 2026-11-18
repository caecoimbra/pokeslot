# Diagnóstico sem credenciais: apenas consulta HTTPS e usa uma chave inválida pública.
$ErrorActionPreference = 'Stop'
$runtime = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies'
$nodePath = Join-Path $runtime 'node\bin\node.exe'
$pnpmPath = Join-Path $runtime 'bin\fallback\pnpm.cmd'
if (-not (Test-Path -LiteralPath $nodePath) -or -not (Test-Path -LiteralPath $pnpmPath)) {
    throw 'Nao encontrei o ambiente Node usado na prova.'
}
Write-Host '1. Verificando conexao HTTPS publica (HTTP 401 significa que a API respondeu):'
& $nodePath -e "fetch('https://console.neon.tech/api/v2/projects').then(r => console.log('HTTP',r.status)).catch(e => { console.log('REDE',e.cause?.code || e.message); process.exitCode=1 })"
Write-Host '2. Verificando a CLI com chave ficticia, que deve ser recusada:'
'invalid-test-key-not-a-secret' | & $pnpmPath dlx neon@8.11.0 profile create pokeslot-diagnostico --keyring --api-key -
Write-Host 'Fim do diagnostico. Nenhuma chave verdadeira foi usada.'
