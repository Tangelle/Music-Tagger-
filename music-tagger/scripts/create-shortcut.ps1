$desktopPath = [Environment]::GetFolderPath('Desktop')
$shortcutPath = Join-Path $desktopPath 'Music Tagger.lnk'
$targetPath = 'C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe'
$arguments = '-ExecutionPolicy Bypass -File "e:\vs_project2\music-tagger\scripts\start-app.ps1"'
$ws = New-Object -ComObject WScript.Shell
$shortcut = $ws.CreateShortcut($shortcutPath)
$shortcut.TargetPath = $targetPath
$shortcut.Arguments = $arguments
$shortcut.WorkingDirectory = 'e:\vs_project2\music-tagger'
$shortcut.Description = 'Music Tagger - Local Music Tag Manager'
$shortcut.IconLocation = 'C:\Windows\System32\SHELL32.dll,108'
$shortcut.Save()
Write-Output "Shortcut created at: $shortcutPath"
