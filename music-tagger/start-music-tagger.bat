@echo off
set "PATH=D:\nodejs;%PATH%"
cd /d "e:\vs_project2\music-tagger"
echo Starting Music Tagger...
call npm run dev
pause
