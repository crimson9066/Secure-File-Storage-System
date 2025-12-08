# Quick Start Guide

## 5-Minute Setup

### 1. Backend Setup

```bash
cd backend
npm install
```

Update `.env`:
```
DB_HOST=localhost
DB_NAME=secure_file_storage
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=change-me-in-production
```

Create database:
```bash
createdb secure_file_storage
psql -U postgres -d secure_file_storage -f src/config/sql.sql
```

Start server:
```bash
npm run dev
```

### 2. Frontend Setup

```bash
cd frontend
npm install
npm start
```

### 3. Open in Browser

Go to http://localhost:3000

### 4. Create Account

- Email: `test@example.com`
- Password: `SecurePassword123!` (must be 12+ chars with uppercase, lowercase, numbers, special chars)

### 5. Upload File

- Click "Upload Files" area or drag-and-drop
- File is encrypted on your machine
- Only encrypted bytes sent to server
- Download and it decrypts on your machine

## Security Verification

To verify end-to-end encryption:

1. Check browser DevTools → Application → Local Storage
   - Your private key is **never** stored in the browser
   
2. Check backend uploads/ folder
   - Files are encrypted (gibberish, not readable)
   
3. Check database
   - File keys are encrypted, never in plaintext
   - `encrypted_key` column contains RSA-encrypted AES keys

## Test Scenarios

### Test 1: File Privacy
1. Login as User A, upload file
2. Logout
3. Login as User B
4. Try to download User A's file → Access denied ✓

### Test 2: File Sharing
1. Get User B's public key (visible in account settings)
2. Share file with User B's email
3. Login as User B
4. File appears in "Shared with You" section
5. Download and decrypt with their private key ✓

### Test 3: Zero-Knowledge
1. Check uploaded file in `/backend/uploads/`
2. Try to open with text editor → Encrypted gibberish ✓
3. Only user with private key can decrypt

## API Testing

### Test endpoint with curl:

```bash
# Sign up
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"SecurePassword123!"}'

# Response:
# {
#   "token": "eyJhbGc...",
#   "user": {"id":"...", "email":"test@example.com"}
# }

# List files
curl -X GET http://localhost:5000/api/files/list \
  -H "Authorization: Bearer eyJhbGc..."
```

## Common Issues

### Port 5000 already in use
```bash
# Windows
netstat -ano | findstr :5000
taskkill /PID <PID> /F

# macOS/Linux
lsof -i :5000
kill -9 <PID>
```

### Database connection failed
```bash
# Check PostgreSQL is running
psql --version

# Create database manually
psql -U postgres -c "CREATE DATABASE secure_file_storage;"
psql -U postgres -d secure_file_storage -f backend/src/config/sql.sql
```

### Module not found errors
```bash
# Clear node_modules and reinstall
cd backend && rm -rf node_modules && npm install
cd ../frontend && rm -rf node_modules && npm install
```

## Workflow

1. **Sign Up** → Generate RSA key pair → Encrypt private key with password
2. **Login** → Derive key from password → Decrypt private key
3. **Upload** → Generate AES key → Encrypt file → Encrypt AES key → Send both
4. **Download** → Fetch encrypted file → Decrypt AES key → Decrypt file → Show to user
5. **Share** → Encrypt AES key with recipient's public key → Send encrypted key → They decrypt with their private key

## Next Steps

1. Read full [README.md](README.md) for complete documentation
2. Explore code in `backend/src` and `frontend/src`
3. Customize branding/colors in frontend
4. Add additional features from the recommendations list
5. Deploy to production with security hardening

## Key Files to Understand

| File | Purpose |
|------|---------|
| `backend/src/utils/encryption.js` | AES-256-GCM and RSA encryption logic |
| `backend/src/routes/auth.js` | User signup/login endpoints |
| `backend/src/routes/files.js` | File upload/download/share endpoints |
| `frontend/src/utils/encryption.js` | Client-side encryption using Web Crypto API |
| `frontend/src/pages/DashboardPage.js` | Main file management UI |

---

**Your secure file storage system is ready to use.**
