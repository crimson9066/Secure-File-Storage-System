# Quick Start: Run Backend with Redis

This guide walks through running the complete secure file storage backend with Redis session support and JWT token version revocation.

---

## Prerequisites

Choose one of the following setup methods:

### Option A: Docker Compose (Recommended - Easiest)
- Docker Desktop ([Download](https://www.docker.com/products/docker-desktop))
- 2GB RAM available

### Option B: Manual Setup
- Node.js v18+ ([Download](https://nodejs.org/))
- PostgreSQL 13+ ([Download](https://www.postgresql.org/download/))
- Redis 6+ ([Download](https://redis.io/download))

---

## Option A: Using Docker Compose (Recommended)

### 1. Start All Services

```bash
cd backend

# Start PostgreSQL, Redis, and Backend
docker-compose up -d

# View logs
docker-compose logs -f backend
```

**Output:**
```
securevault-postgres  | database system is ready to accept connections
securevault-redis    | Ready to accept connections
securevault-backend  | 🔒 Secure File Storage Backend running on port 5000
```

### 2. Verify All Services

```bash
# Check health
docker-compose ps

# Expected output:
# NAME                    STATUS
# securevault-postgres    Up (healthy)
# securevault-redis       Up (healthy)
# securevault-backend     Up (healthy)
```

### 3. Test API

```bash
curl http://localhost:5000/api/health
```

Response:
```json
{"status":"ok","timestamp":"2025-12-03T21:30:00.000Z"}
```

### 4. Access Databases

**PostgreSQL:**
```bash
docker-compose exec postgres psql -U postgres -d secure_file_storage

# List tables:
\dt
```

**Redis:**
```bash
docker-compose exec redis redis-cli

# Check keys:
KEYS *
# Check connection:
PING
```

### 5. Stop Services

```bash
# Stop all containers
docker-compose down

# Stop and remove volumes (clean slate)
docker-compose down -v
```

---

## 🛠️ Option B: Manual Setup

### 1. Install Redis

**Windows (WSL2):**
```bash
# In WSL2 terminal
wsl
sudo apt update && sudo apt install redis-server
redis-server
```

**macOS:**
```bash
brew install redis
redis-server
```

**Linux (Ubuntu/Debian):**
```bash
sudo apt update && sudo apt install redis-server
redis-server
```

### 2. Install PostgreSQL

- Follow [PostgreSQL Download](https://www.postgresql.org/download/) for your OS
- Create database:
  ```bash
  createdb secure_file_storage
  ```
- Run migrations:
  ```bash
  psql -U postgres -d secure_file_storage -f backend/src/config/sql.sql
  psql -U postgres -d secure_file_storage -f backend/src/config/sql_update_users.sql
  ```

### 3. Install Backend Dependencies

```bash
cd backend
npm install
```

### 4. Configure Environment

Create `backend/.env`:

```env
NODE_ENV=development
PORT=5000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=secure_file_storage
DB_USER=postgres
DB_PASSWORD=postgres
JWT_SECRET=your-super-secret-key-change-in-production
JWT_EXPIRE=24h
REDIS_URL=redis://127.0.0.1:6379
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=104857600
CORS_WHITELIST=http://localhost:3000,http://localhost:3001
LOG_LEVEL=info
```

### 5. Start Backend Server

```bash
cd backend
npm run dev

# Output:
# 🔒 Secure File Storage Backend running on port 5000
# Environment: development
```

---

## 🧪 Run Tests

### JWT Token Version Revocation

```bash
cd backend
node test-auth-token-version.js
```

Expected:
```
✅ ALL TESTS PASSED!
  ✓ JWT includes token_version
  ✓ Token verification enforces version match
  ✓ Upload sessions stored in Redis
  ✓ Finalize locks prevent races
```

### Chunked Upload with Redis

```bash
cd backend
node test-chunked-upload.js
```

Expected:
```
✅ ALL CHUNKED UPLOAD TESTS PASSED!
  ✓ Upload session creation and retrieval
  ✓ Multiple chunks recorded to Redis
  ✓ Finalize lock prevents concurrent access
  ✓ Session cleanup deletes all data
```

---

## ✅ Test API Endpoints

### 1. Health Check

```bash
curl http://localhost:5000/api/health
```

### 2. Sign Up

```bash
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'
```

Response includes JWT with `token_version`:
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjEsImVtYWlsIjoidGVzdEBleGFtcGxlLmNvbSIsInRva2VuX3ZlcnNpb24iOjAsImlhdCI6MTcwMTYzMTgwMCwiZXhwIjoxNzAxNzE4MjAwfQ...",
  "user": {
    "id": 1,
    "email": "test@example.com",
    "publicKey": "-----BEGIN RSA PUBLIC KEY-----..."
  }
}
```

### 3. Login (Token with version)

```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "SecurePass123!"
  }'
```

### 4. Get Current User (Validates Token Version)

```bash
# Replace <TOKEN> with actual JWT from signup/login
curl -H "Authorization: Bearer <TOKEN>" \
  http://localhost:5000/api/auth/me
```

If token is valid: Returns user info
If token revoked: Returns `401 Token revoked or invalid`

### 5. Initialize Chunked Upload

```bash
curl -X POST http://localhost:5000/api/files/chunk/init \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.bin",
    "totalSize": 1048576,
    "totalChunks": 2,
    "chunkSize": 524288
  }'
```

Response:
```json
{
  "uploadId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
  "filename": "test.bin",
  "totalChunks": 2,
  "expiresAt": "2025-12-04T21:30:00.000Z"
}
```

### 6. Append Chunk

```bash
# Create 512KB chunk
dd if=/dev/zero bs=1024 count=512 | base64 > chunk.b64

curl -X POST http://localhost:5000/api/files/chunk/append \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d "{
    \"uploadId\": \"a1b2c3d4-e5f6-7890-abcd-ef1234567890\",
    \"chunkIndex\": 0,
    \"chunkHash\": \"sha256hash...\",
    \"chunkData\": \"$(cat chunk.b64)\"
  }"
```

### 7. Finalize Upload

```bash
curl -X POST http://localhost:5000/api/files/chunk/finalize \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "uploadId": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "encryptedKey": "base64encryptedkey...",
    "fileHash": "sha256filehash..."
  }'
```

---

## 🔐 Security Features Verified

### ✅ JWT Token Version Revocation
- Token includes `token_version` field
- Auth middleware validates version against database
- Changing password increments `token_version` → all old tokens revoked
- Updating private key increments `token_version` → all old tokens revoked

### ✅ Redis-Backed Upload Sessions
- Sessions persist in Redis (survives restarts)
- Multi-server safe (works with load balancing)
- Auto-cleanup via TTL (24 hours)
- Chunks stored with metadata

### ✅ Finalize Locking
- Distributed lock prevents concurrent finalization
- Only one process can finalize at a time
- Lock automatically released
- Race conditions prevented

---

## 📊 Architecture

```
Client (React)
    │
    ├─ HTTPS/TLS
    │
    ▼
Backend (Node.js + Express)
    │
    ├─ JWT auth (with token_version)
    ├─ Request validation (zod)
    ├─ Rate limiting
    ├─ CORS + CSRF protection
    │
    ├─ PostgreSQL (user data, file metadata)
    │
    ├─ Redis (session storage, locks)
    │   ├─ upload:meta:*
    │   ├─ upload:chunk:*
    │   ├─ upload:uploaded:*
    │   └─ upload:lock:*
    │
    └─ Filesystem (./uploads)
```

---

## 🐛 Troubleshooting

### Backend won't start

**Error:** `connect ECONNREFUSED 127.0.0.1:6379`

**Solution:**
```bash
# Verify Redis running
redis-cli ping
# Should return: PONG

# If not running:
redis-server
```

**Error:** `Error: connect ECONNREFUSED 127.0.0.1:5432`

**Solution:**
```bash
# Verify PostgreSQL running
psql -U postgres -c "SELECT 1"

# If not running:
# macOS:
brew services start postgresql
# Linux:
sudo systemctl start postgresql
```

### Tests fail

**Solution:**
```bash
# Clear Redis
redis-cli FLUSHALL

# Clear uploads directory
rm -rf backend/uploads/*

# Run tests again
node test-auth-token-version.js
node test-chunked-upload.js
```

### Token rejected immediately

**Cause:** Database doesn't have `token_version` column

**Solution:**
```bash
# Run migration
psql -U postgres -d secure_file_storage -f backend/src/config/sql_update_users.sql

# Verify
psql -U postgres -d secure_file_storage -c "\d users"
```

---

## 📈 Performance Tips

### For Local Development
- Redis in-memory only (fine for testing)
- 1 backend instance
- Direct PostgreSQL connection

### For Production
- Enable Redis persistence: `appendonly yes`
- Multiple backend instances (load balanced)
- Connection pooling
- Separate Redis cluster
- Separate PostgreSQL replica

---

## 🎯 Next Steps

1. ✅ Run tests (verify everything works)
2. ✅ Test API endpoints (with curl or Postman)
3. ✅ Start frontend (see GETTING_STARTED.md)
4. ✅ Test complete signup/login/upload flow
5. ⏭️ Deploy to production (see DEPLOYMENT.md)

---

## 📚 Related Files

- [TESTING_REDIS_JWT.md](./TESTING_REDIS_JWT.md) - Detailed test documentation
- [API.md](../API.md) - Full API reference
- [SECURITY.md](../SECURITY.md) - Security details
- [DEPLOYMENT.md](../DEPLOYMENT.md) - Production setup

---

**Status:** ✅ All Components Working  
**Last Updated:** December 3, 2025  

*Questions? Check the troubleshooting section or review test output.*
