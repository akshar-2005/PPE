@echo off
echo ======================================================================
echo STARTING PPE VISION SAFETY DEMO...
echo ======================================================================

echo Launching FastAPI Backend Server (Port 8000)...
pushd "%~dp0backend"
start "PPE Vision Backend" cmd /k ".\venv\Scripts\activate.bat && uvicorn main:app --port 8000"
popd

echo Launching React Frontend Server (Port 5173)...
pushd "%~dp0frontend"
start "PPE Vision Frontend" cmd /k "npm run dev"
popd

echo Waiting for servers to initialize...
ping 127.0.0.1 -n 5 >nul

echo Opening PPE Vision Dashboard in browser...
start http://localhost:5173

echo ======================================================================
echo Demo servers running. Close terminal windows to stop the servers.
echo ======================================================================
