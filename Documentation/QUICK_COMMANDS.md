# Command Reference: Get Started Now

## Quick Copy-Paste Commands

### Option A: Docker (Easiest - All Services Included)

```bash
# Navigate to backend
cd backend

# Start all services (PostgreSQL + Redis + Backend)
docker-compose up -d

# View logs
docker-compose logs -f backend

# Test API
curl http://localhost:5000/api/health

# Stop everything
docker-compose down
```

**Expected output:**
```
securevault-postgres    Up (healthy)
securevault-redis       Up (healthy)
securevault-backend     Up (healthy)

{"status":"ok","timestamp":"2025-12-03T21:30:00.000Z"}
```

---

### Option B: Manual Setup (More Control)

#### Terminal 1: Start Redis
```bash
# macOS
brew install redis
redis-server

# Windows (WSL2)
wsl
sudo apt install redis-server
redis-server

# Linux
redis-server
```

#### Terminal 2: Start PostgreSQL
```bash
# Create database
createdb secure_file_storage

# Run migrations
psql -U postgres -d secure_file_storage < backend/src/config/sql.sql
psql -U postgres -d secure_file_storage < backend/src/config/sql_update_users.sql
```

#### Terminal 3: Start Backend
```bash
cd backend
npm install
npm run dev
```

**Output:**
```
Secure File Storage Backend running on port 5000
Environment: development
```

---

## Run All Tests

```bash
cd backend

# JWT Token Version Tests (9 tests)
node test-auth-token-version.js

# Chunked Upload Tests (8 tests)
node test-chunked-upload.js
```

**Expected:**
```
ALL TESTS PASSED!
17/17 tests passing
```

---

## Test API Manually

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

**Response:**
```json
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "id": 1,
    "email": "test@example.com",
    "publicKey": "-----BEGIN RSA PUBLIC KEY-----..."
  }
}
```

**Save the token for next requests:**
```bash
export TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
```

### 3. Get Current User (Tests JWT validation)
```bash
curl -H "Authorization: Bearer $TOKEN" \
  http://localhost:5000/api/auth/me
```

### 4. Initialize Chunked Upload
```bash
curl -X POST http://localhost:5000/api/files/chunk/init \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "filename": "test.bin",
    "totalSize": 1048576,
    "totalChunks": 2,
    "chunkSize": 524288
  }'
```

**Response:**
```json
{
  "uploadId": "uuid...",
  "filename": "test.bin",
  "totalChunks": 2,
  "expiresAt": "2025-12-04T21:30:00.000Z"
}
```

---

##  Docker Compose Commands

```bash
cd backend

# Start
docker-compose up -d

# View logs
docker-compose logs -f backend
docker-compose logs -f postgres
docker-compose logs -f redis

# Access services
docker-compose exec postgres psql -U postgres -d secure_file_storage
docker-compose exec redis redis-cli

# Stop
docker-compose down

# Stop and clean volumes
docker-compose down -v
```

---

##  Database Commands

### PostgreSQL
```bash
# Connect
psql -U postgres -d secure_file_storage

# List tables
\dt

# Check users table
SELECT id, email, token_version FROM users;

# Check token_version column exists
\d users

# Run migrations
psql -U postgres -d secure_file_storage < backend/src/config/sql.sql
psql -U postgres -d secure_file_storage < backend/src/config/sql_update_users.sql
```

### Redis
```bash
# Connect
redis-cli

# Check connection
PING

# View all keys
KEYS *

# View uploads
KEYS upload:*

# Get session metadata
GET upload:meta:<uploadId>

# Monitor in real-time
MONITOR
```

---

## Environment Setup

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
RSA_KEY_SIZE=4096
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=104857600
MAX_TOTAL_UPLOAD_SIZE=1099511627776
LOG_LEVEL=info
CORS_WHITELIST=http://localhost:3000,http://localhost:3001
TRUST_PROXY=0
BODY_LIMIT=50mb
AUTH_RATE_LIMIT=10
GLOBAL_RATE_LIMIT=200
REDIS_URL=redis://127.0.0.1:6379
```

---

## Troubleshooting

### Redis Connection Error
```bash
# Check if Redis running
redis-cli ping
# Should return: PONG

# Start Redis
redis-server
```

### PostgreSQL Connection Error
```bash
# Check if PostgreSQL running
psql -U postgres -c "SELECT 1"

# Start PostgreSQL (if not running)
# macOS:
brew services start postgresql

# Linux:
sudo systemctl start postgresql
```

### Backend won't start
```bash
# Check logs
npm run dev

# Clear uploads directory
rm -rf uploads/*

# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
npm run dev
```

### Port already in use
```bash
# Find process on port 5000
lsof -i :5000

# Kill process
kill -9 <PID>
```

---

## Verify Installation

### Quick Check
```bash
# Check Node.js
node --version

# Check npm
npm --version

# Check PostgreSQL
psql --version

# Check Redis
redis-cli --version
```

### Full Stack Check
```bash
# 1. Start services (Docker)
docker-compose up -d

# 2. Run tests
cd backend
node test-auth-token-version.js
node test-chunked-upload.js

# 3. Test API
curl http://localhost:5000/api/health

# All should return success
```

---

## Documentation Reference

| Document | Purpose |
|----------|---------|
| [FINAL_REPORT.md](./FINAL_REPORT.md) | Complete overview |
| [TESTING_REDIS_JWT.md](./backend/TESTING_REDIS_JWT.md) | Testing guide |
| [QUICKSTART_REDIS.md](./backend/QUICKSTART_REDIS.md) | Redis setup |
| [SECURITY.md](./SECURITY.md) | Security details |
| [API.md](./API.md) | API reference |
| [DEPLOYMENT.md](./DEPLOYMENT.md) | Production setup |

---

## Common Workflows

### Workflow 1: Test Locally with Docker
```bash
cd backend
docker-compose up -d
docker-compose logs -f backend
# Navigate to http://localhost:5000/api/health
docker-compose down
```

### Workflow 2: Development with Hot Reload
```bash
cd backend
npm install
npm run dev
# Edit files, changes auto-reload
```

### Workflow 3: Database Inspection
```bash
# PostgreSQL
psql -U postgres -d secure_file_storage

# Redis
redis-cli
KEYS *
```

### Workflow 4: Full Integration Test
```bash
cd backend

# Start services
docker-compose up -d

# Run tests
node test-auth-token-version.js
node test-chunked-upload.js

# Test API
curl http://localhost:5000/api/health

# Cleanup
docker-compose down
```

---

## Performance Check

```bash
# Test response time
time curl http://localhost:5000/api/health

# Load test (install: npm install -g autocannon)
autocannon -c 10 -d 30 http://localhost:5000/api/health

# Monitor resources
# macOS:
top

# Linux:
htop

# Windows:
tasklist
```

---

## Success Indicators

### When Everything is Working

```
Backend:
- Running on port 5000
- Connected to PostgreSQL
- Connected to Redis
- Health check returns 200

Tests:
- All 17 tests passing
- JWT tests passing
- Chunked upload tests passing

Database:
- Tables created
- token_version column exists
- HMAC column exists

Redis:
- Server running
- Can store/retrieve keys
- Sessions persisted
```

---

##  You're All Set!

**You can now:**
- Run backend with Redis
- Test JWT revocation
- Test chunked uploads
- Test finalize locking
- Test full API

**Next Steps:**
1. Run tests locally
2. Test API endpoints
3. Review code (src/)
4. Read documentation
5. Deploy to production (see DEPLOYMENT.md)

---

**Questions?** Check the troubleshooting section or read TESTING_REDIS_JWT.md

---

*Copy-paste any command above to get started immediately!*
