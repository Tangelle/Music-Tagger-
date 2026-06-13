# Music Tagger launcher
$env:PATH = "D:\nodejs;" + $env:PATH
Set-Location "e:\vs_project2\music-tagger"
Write-Host "Starting Music Tagger..." -ForegroundColor Cyan
npm run dev
Read-Host "Press Enter to exit"
