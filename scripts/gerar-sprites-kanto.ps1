# Executar no Windows apenas para atualizar a arte local dos cards.
# Origem: https://github.com/PokeAPI/sprites/tree/c0542f7c51215d9672439012838c99f520596cbd/sprites/pokemon
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Net.Http
$revision = 'c0542f7c51215d9672439012838c99f520596cbd'
$source = "https://raw.githubusercontent.com/PokeAPI/sprites/$revision/sprites/pokemon"
$output = Join-Path $PSScriptRoot '../src/preview/assets'
[IO.Directory]::CreateDirectory($output) | Out-Null
$client = [Net.Http.HttpClient]::new()
try {
    foreach ($variant in 'normal', 'shiny') {
        $base = if ($variant -eq 'normal') { $source } else { "$source/shiny" }
        $sheet = [Drawing.Bitmap]::new(16 * 96, 10 * 96)
        $graphics = [Drawing.Graphics]::FromImage($sheet)
        try {
            for ($first = 1; $first -le 151; $first += 8) {
                $batch = foreach ($id in $first..([Math]::Min($first + 7, 151))) {
                    [PSCustomObject]@{ Id = $id; Download = $client.GetByteArrayAsync("$base/$id.png") }
                }
                foreach ($entry in $batch) {
                    $stream = [IO.MemoryStream]::new($entry.Download.GetAwaiter().GetResult())
                    try {
                        $sprite = [Drawing.Bitmap]::new($stream)
                        try {
                            if ($sprite.Width -ne 96 -or $sprite.Height -ne 96) { throw "Tamanho inesperado para #$($entry.Id)" }
                            $index = $entry.Id - 1
                            $graphics.DrawImageUnscaled($sprite, ($index % 16) * 96, [Math]::Floor($index / 16) * 96)
                        } finally { $sprite.Dispose() }
                    } finally { $stream.Dispose() }
                }
            }
            $sheet.Save((Join-Path $output "kanto-$variant.png"), [Drawing.Imaging.ImageFormat]::Png)
        } finally { $graphics.Dispose(); $sheet.Dispose() }
    }
    $dataSource = 'https://raw.githubusercontent.com/PokeAPI/pokeapi/de6760be38b60a3024f1d9054330ff265f0dc619/data/v2/csv/pokemon_species_names.csv'
    $records = $client.GetStringAsync($dataSource).GetAwaiter().GetResult() | ConvertFrom-Csv
    $names = $records | Where-Object { $_.local_language_id -eq '9' -and [int]$_.pokemon_species_id -le 151 } | Sort-Object { [int]$_.pokemon_species_id }
    if ($names.Count -ne 151) { throw 'Catálogo incompleto' }
    [IO.File]::WriteAllText((Join-Path $output 'kanto-names.json'), (ConvertTo-Json -InputObject @($names.name)) + [Environment]::NewLine, [Text.UTF8Encoding]::new($false))
} finally { $client.Dispose() }
