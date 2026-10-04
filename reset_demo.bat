@echo off
echo ======================================================================
echo PPE VISION SAFETY DEMO RESET SCRIPT
echo ======================================================================
echo NOTE: Ensure the backend server is STOPPED before running this script.
echo.

set /p confirm="Are you sure you want to reset the database and outputs? (Y/N): "
if /i "%confirm%"=="Y" (
    echo Cleaning database and output images...
    pushd "%~dp0backend"
    if exist "history.db" del /f /q "history.db"
    if exist "outputs\*.jpg" del /f /q "outputs\*.jpg"
    popd
    echo.
    echo Demo database and output images reset successfully.
) else (
    echo Reset cancelled.
)

echo.
pause
