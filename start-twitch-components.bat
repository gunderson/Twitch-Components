@REM @echo off

@REM REM Navigate to the directory
@REM cd "c:\Users\pat\Development\WebRTC-Telestrator-dev"

@REM REM Start the Node service
@REM start cmd /k "node ."

@REM REM Wait for a few seconds to ensure the Node service starts
@REM timeout /t 5 /nobreak

@REM REM Open the web browser windows
@REM start "" "http://localhost:8888"
@REM start "" "http://localhost:8888"

@REM echo Telestrator service started and browsers opened.


cd "c:\Users\pat\Development\Twitch Components"
start cmd /k "node ."

start "" "http://localhost:3033"