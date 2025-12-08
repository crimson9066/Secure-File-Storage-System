#!/bin/bash

# Database setup script for PostgreSQL

echo "🔒 Setting up SecureVault Database"
echo "===================================="
echo ""

# Check if PostgreSQL is running
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed or not in PATH"
    echo "Please install PostgreSQL and add it to your PATH"
    exit 1
fi

# Prompt for database user
read -p "PostgreSQL user (default: postgres): " DB_USER
DB_USER=${DB_USER:-postgres}

# Prompt for database password
read -sp "PostgreSQL password: " DB_PASSWORD
echo ""

# Prompt for database name
read -p "Database name (default: secure_file_storage): " DB_NAME
DB_NAME=${DB_NAME:-secure_file_storage}

# Create database
echo "Creating database: $DB_NAME"
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h localhost -c "DROP DATABASE IF EXISTS $DB_NAME;" 2>/dev/null
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h localhost -c "CREATE DATABASE $DB_NAME;" 

if [ $? -eq 0 ]; then
    echo "✅ Database created"
else
    echo "❌ Failed to create database"
    exit 1
fi

# Run migrations
echo "Running migrations..."
PGPASSWORD=$DB_PASSWORD psql -U $DB_USER -h localhost -d $DB_NAME -f backend/src/config/sql.sql

if [ $? -eq 0 ]; then
    echo "✅ Migrations completed"
else
    echo "❌ Migration failed"
    exit 1
fi

echo ""
echo "✅ Database setup complete!"
echo ""
echo "Update your .env file:"
echo "  DB_USER=$DB_USER"
echo "  DB_PASSWORD=$DB_PASSWORD"
echo "  DB_NAME=$DB_NAME"
