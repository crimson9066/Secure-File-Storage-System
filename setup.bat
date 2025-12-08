@echo off
REM Secure File Storage System - Development Setup Script (Windows)

echo 🔐 SecureVault - Setup Script
echo ==============================
echo.

REM Check Node.js
where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ Node.js is not installed. Please install Node.js v14 or higher
    echo    https://nodejs.org/
    exit /b 1
)

for /f "tokens=*" %%i in ('node --version') do set NODE_VERSION=%%i
echo ✅ Node.js %NODE_VERSION%

REM Check npm
where npm >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ npm is not installed
    exit /b 1
)

for /f "tokens=*" %%i in ('npm --version') do set NPM_VERSION=%%i
echo ✅ npm %NPM_VERSION%

REM Check PostgreSQL
where psql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ PostgreSQL is not installed
    echo    Download: https://www.postgresql.org/download/windows/
    exit /b 1
)

for /f "tokens=*" %%i in ('psql --version') do set PG_VERSION=%%i
echo ✅ %PG_VERSION%
echo.

REM Setup Backend
echo 📦 Setting up Backend...
cd backend
call npm install

REM Create uploads directory
if not exist uploads mkdir uploads

REM Setup Frontend
echo 📦 Setting up Frontend...
cd ..\frontend
call npm install

cd ..

echo.
echo ✅ Setup complete!
echo.
echo Next steps:
echo 1. Create PostgreSQL database:
echo    createdb -U postgres secure_file_storage
echo.
echo 2. Run migrations:
echo    psql -U postgres -d secure_file_storage -f backend/src/config/sql.sql
echo.
echo 3. Start backend (in one terminal):
echo    cd backend
echo    npm run dev
echo.
echo 4. Start frontend (in another terminal):
echo    cd frontend
echo    npm start
echo.
echo 5. Open http://localhost:3000 in your browser
echo.
pause
