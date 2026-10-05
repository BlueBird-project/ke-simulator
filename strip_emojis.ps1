$files = @("README.md","QUICKSTART.md","ARCHITECTURE.md")
$pattern = [regex]'[\uD800-\uDBFF][\uDC00-\uDFFF]|[\u2600-\u27BF]|\uFE0F|[\u2B00-\u2BFF]|\u2705|\u274C|\u2714|\u2716|\u2733|\u2734'
$enc = New-Object System.Text.UTF8Encoding($false)
foreach ($f in $files) {
  $full = Join-Path (Get-Location) $f
  $content = [System.IO.File]::ReadAllText($full)
  $clean = $pattern.Replace($content, '')
  $clean = $clean -replace '(?m)^(#{1,6})[ \t]{2,}', '$1 '
  $clean = $clean -replace '(?m)^(#{1,6})[ \t]+$', '$1'
  [System.IO.File]::WriteAllText($full, $clean, $enc)
  Write-Output "Cleaned: $f"
}
