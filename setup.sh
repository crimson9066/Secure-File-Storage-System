#!/bin/bash

# Secure File Storage System - Development Setup Script

echo "🔐 SecureVault - Setup Script"
echo "=============================="
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js (v14+)"
    exit 1
fi

echo "✅ Node.js $(node --version)"

# Check npm
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed"
    exit 1
fi

echo "✅ npm $(npm --version)"

# Check PostgreSQL
if ! command -v psql &> /dev/null; then
    echo "❌ PostgreSQL is not installed. Please install PostgreSQL"
    echo "   macOS: brew install postgresql"
    echo "   Ubuntu: sudo apt-get install postgresql"
    echo "   Windows: https://www.postgresql.org/download/windows/"
    exit 1
fi

echo "✅ PostgreSQL $(psql --version)"
echo ""

# Setup Backend
echo "📦 Setting up Backend..."
cd backend
npm install

# Create uploads directory
mkdir -p uploads

# Setup Frontend
echo "📦 Setting up Frontend..."
cd ../frontend
npm install

cd ..

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Create PostgreSQL database:"
echo "   createdb secure_file_storage"
echo ""
echo "2. Run migrations:"
echo "   psql -U postgres -d secure_file_storage -f backend/src/config/sql.sql"
echo ""
echo "3. Start backend (in one terminal):"
echo "   cd backend && npm run dev"
echo ""
echo "4. Start frontend (in another terminal):"
echo "   cd frontend && npm start"
echo ""
echo "5. Open http://localhost:3000 in your browser"
echo ""
