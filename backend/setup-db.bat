@echo off
REM Database setup script for PostgreSQL (Windows)

echo 🔐 Setting up SecureVault Database
echo ====================================
echo.

REM Check if psql exists
where psql >nul 2>nul
if %ERRORLEVEL% neq 0 (
    echo ❌ PostgreSQL is not installed or not in PATH
    echo Please install PostgreSQL and add it to your PATH
    pause
    exit /b 1
)

set /p DB_USER="PostgreSQL user (default: postgres): "
if "%DB_USER%"=="" set DB_USER=postgres

set /p DB_PASSWORD="PostgreSQL password: "

set /p DB_NAME="Database name (default: secure_file_storage): "
if "%DB_NAME%"=="" set DB_NAME=secure_file_storage

echo Creating database: %DB_NAME%
set PGPASSWORD=%DB_PASSWORD%
psql -U %DB_USER% -h localhost -c "DROP DATABASE IF EXISTS %DB_NAME%;" 2>nul
psql -U %DB_USER% -h localhost -c "CREATE DATABASE %DB_NAME%;"

if %ERRORLEVEL% equ 0 (
    echo ✅ Database created
) else (
    echo ❌ Failed to create database
    pause
    exit /b 1
)

echo Running migrations...
psql -U %DB_USER% -h localhost -d %DB_NAME% -f backend\src\config\sql.sql

if %ERRORLEVEL% equ 0 (
    echo ✅ Migrations completed
) else (
    echo ❌ Migration failed
    pause
    exit /b 1
)

echo.
echo ✅ Database setup complete!
echo.
echo Update your .env file:
echo   DB_USER=%DB_USER%
echo   DB_PASSWORD=%DB_PASSWORD%
echo   DB_NAME=%DB_NAME%
echo.
pause
