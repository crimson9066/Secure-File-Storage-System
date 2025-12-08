# Request Validation & Chunked Upload Implementation

## Summary of Changes

This update adds comprehensive request validation with Zod, resumable chunked file uploads for large files (>1GB), and background job queue infrastructure with BullMQ.

### 1. **Request Validation (Zod)**

#### Files Created:
- `backend/src/validation/schemas.js` — Validation schemas for all endpoints:
  - `signupSchema`, `loginSchema` — email (valid), password (min 12 chars)
  - `fileUploadSchema`, `shareFileSchema` — UUID fileId, valid email, encrypted key
  - `initChunkUploadSchema`, `appendChunkSchema`, `finalizeChunkUploadSchema` — chunked upload validation
  - `validateRequest` middleware factory for Express

#### Updated:
- `backend/src/routes/auth.js` — Added `validateRequest` middleware to `/signup`, `/login`
- `backend/src/routes/files-validated.js` — New file routes with validation on `/share` endpoint
- `backend/package.json` — Added `zod`, `bull`, `redis`

**Benefit:** Prevents injection attacks, malformed requests, and provides type-safe request handling.

---

### 2. **Chunked/Resumable Upload Support**

#### Files Created:
- `backend/src/routes/chunked.js` — Three new endpoints:
  - `POST /files/chunk/init` — Initialize upload session (returns uploadId, TTL)
  - `POST /files/chunk/append` — Upload individual chunk (tracks progress)
  - `POST /files/chunk/finalize` — Combine all chunks and create file record
- `backend/src/models/uploadSession.js` — In-memory session management (can be moved to Redis):
  - `createUploadSession`, `getUploadSession`, `recordChunkUpload`, `deleteUploadSession`
  - Auto-cleanup of expired sessions (24-hour TTL)
- `frontend/src/components/ChunkedFileUploader.js` — React component for chunked uploads:
  - File selection, chunk splitting (5MB default), progress tracking
  - Uses Web Crypto for chunk hashing (SHA-256)
  - Integrates with API client

#### Workflow:
1. User selects large file (>1GB)
2. Frontend computes total chunks, calls `POST /files/chunk/init`
3. Frontend splits file, uploads each chunk via `POST /files/chunk/append`
4. Frontend finalizes via `POST /files/chunk/finalize` (combines chunks, creates DB record)
5. Server verifies all chunks received, concatenates, stores as encrypted file
6. Session auto-expires after 24 hours; can resume within TTL

**Config Variables Added:**
- `MAX_TOTAL_UPLOAD_SIZE` (default 1TB)
- Chunk size defaults to 5MB client-side

**Benefit:** Supports multi-GB files, resumable uploads, better UX with progress feedback.

---

### 3. **Background Job Queue (BullMQ)**

#### Files Created:
- `backend/src/queue/fileProcessing.js` — Job queue for async tasks:
  - `encrypt` job processor (placeholder for streaming encryption)
  - `decrypt` job processor (placeholder for streaming decryption)
  - Error/completion event handlers with logging
  - Requires Redis connection (configured via `REDIS_HOST`, `REDIS_PORT`)

#### Files Created:
- `backend/src/utils/streaming.js` — Stream-based crypto helpers:
  - `createEncryptionStream()` — Returns Transform stream + key/iv for streaming AES-256-GCM
  - `createDecryptionStream()` — Streaming AES-256-GCM decryption
  - `createHashStream()` — Streaming SHA-256 hashing

**Benefits:**
- **Large file support:** Encryption/decryption streams prevent OOM (out of memory) on multi-GB files
- **Background processing:** Offload CPU-intensive tasks to queue workers
- **Persistence:** BullMQ with Redis enables job retry and failure tracking
- **Scalability:** Queue can be processed by multiple workers on different servers

**Usage Example (in routes):**
```javascript
const fileProcessingQueue = require('../queue/fileProcessing');

// Enqueue background job
fileProcessingQueue.add('encrypt', {
  fileId: record.id,
  inputPath: filePath,
  outputPath: encryptedPath,
  key, iv
});

// Job processor handles async encryption
fileProcessingQueue.process('encrypt', async (job) => {
  // Streaming encryption happens here
});
```

---

### 4. **Updated .env Configuration**

New variables in `.env.example`:
```dotenv
MAX_TOTAL_UPLOAD_SIZE=1099511627776  # 1TB
LOG_LEVEL=info
CORS_WHITELIST=http://localhost:3000,http://localhost:3001
TRUST_PROXY=0
BODY_LIMIT=50mb
AUTH_RATE_LIMIT=10
GLOBAL_RATE_LIMIT=200
REDIS_HOST=localhost
REDIS_PORT=6379
```

---

### 5. **Files Modified/Created**

| File | Type | Purpose |
|------|------|---------|
| `backend/package.json` | Update | Add zod, bull, redis deps |
| `backend/src/validation/schemas.js` | Create | Zod schemas + middleware |
| `backend/src/utils/streaming.js` | Create | Streaming crypto utilities |
| `backend/src/queue/fileProcessing.js` | Create | BullMQ job queue setup |
| `backend/src/routes/auth.js` | Update | Add validateRequest middleware |
| `backend/src/routes/files-validated.js` | Create | Files routes with validation |
| `backend/src/routes/chunked.js` | Create | Chunked upload endpoints |
| `backend/src/models/uploadSession.js` | Create | Session management |
| `backend/src/index-v2.js` | Create | Updated entry with chunked routes |
| `backend/.env.example` | Create | Full env template |
| `frontend/src/components/ChunkedFileUploader.js` | Create | React chunked uploader |

---

### 6. **Next Steps**

1. **Install deps:**
   ```bash
   npm install zod bull redis
   ```

2. **Start Redis** (required for job queue):
   ```bash
   redis-server
   ```

3. **Replace `backend/src/index.js` with `index-v2.js`:**
   ```bash
   mv backend/src/index.js backend/src/index-old.js
   mv backend/src/index-v2.js backend/src/index.js
   mv backend/src/routes/files.js backend/src/routes/files-old.js
   mv backend/src/routes/files-validated.js backend/src/routes/files.js
   ```

4. **Test chunked upload:**
   - Use frontend `ChunkedFileUploader` component
   - Upload file > 100MB and verify chunk-by-chunk progress

5. **Production Hardening:**
   - Move upload sessions to Redis for multi-server support
   - Implement actual streaming encryption in job queue
   - Add cleanup job for orphaned upload sessions
   - Configure horizontal scaling with sticky sessions

---

### 7. **API Endpoints (New/Updated)**

#### Chunked Upload Endpoints:
```
POST /api/files/chunk/init
Body: { filename, totalSize, totalChunks, chunkSize }
Response: { uploadId, expiresAt }

POST /api/files/chunk/append
Body: { uploadId, chunkIndex, chunkHash }
Response: { uploadId, chunkIndex, uploadedChunks, progress }

POST /api/files/chunk/finalize
Body: { uploadId, encryptedKey, fileHash }
Response: { fileId, filename, size }
```

#### Updated Endpoints (with validation):
```
POST /api/auth/signup
Body: { email (email), password (min 12 chars) }

POST /api/auth/login
Body: { email (email), password }

POST /api/files/share
Body: { fileId (uuid), recipientEmail (email), encryptedKey }
```

---
