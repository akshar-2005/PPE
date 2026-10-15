@echo off
echo ======================================================================
echo PPE VISION SAFETY DEMO RESET SCRIPT
echo ======================================================================
echo NOTE: Ensure the backend server is STOPPED before running this script.
echo NOTE: User accounts and authentication credentials (auth.db) are preserved.
echo.

set /p confirm="Are you sure you want to reset history.db and output images? (auth.db will NOT be touched) (Y/N): "
if /i "%confirm%"=="Y" (
    echo Cleaning history database and output images...
    pushd "%~dp0backend"
    if exist "history.db" del /f /q "history.db"
    if exist "outputs\*.jpg" del /f /q "outputs\*.jpg"
    popd
    echo.
    echo Demo inspection history and output images reset successfully (auth.db preserved).
) else (
    echo Reset cancelled.
)

echo.
pause
