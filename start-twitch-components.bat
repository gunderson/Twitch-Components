@echo off

REM Navigate to the directory
cd "c:\Users\pat\Development\WebRTC-Telestrator-dev"

REM Start the Node service
start cmd /k "node ."

REM Wait for a few seconds to ensure the Node service starts
timeout /t 5 /nobreak

REM Open the web browser windows
start "" "http://localhost:8888"
start "" "http://localhost:8888"

echo Telestrator service started and browsers opened.


cd "c:\Users\pat\Development\Twitch Components"
start cmd /k "node ."

start "" "http://localhost:3033"