# Quick Reference - New Backend Infrastructure

## Error Codes

Every error now has a unique code for log searching.

### Authentication (AUTH_xxx)
```
AUTH_001 - Invalid token
AUTH_002 - Token revoked
AUTH_003 - Invalid credentials
```

### Files (FILE_xxx)
```
FILE_001 - File not found
FILE_002 - Access denied
FILE_003 - File too large
```

### Uploads (UP_xxx)
```
UP_001 - Upload session not found
UP_002 - Chunk error / missing
UP_003 - Storage error
```

### Validation (VAL_xxx)
```
VAL_001 - Validation failed
VAL_002 - Invalid email
VAL_003 - Weak password
```

### Encryption (ENC_xxx)
```
ENC_001 - Encryption failed
ENC_002 - Decryption failed
ENC_003 - Key generation failed
```

## Logging

### Audit Events (compliance trail)
```javascript
vaultLogger.audit('File uploaded', {
  userId: '123',
  fileId: 'abc',
  filename: 'report.pdf',
  size: 1024
});
```

### Security Events (auth failures, tokens)
```javascript
vaultLogger.security('Invalid credentials', {
  email: 'user@example.com',
  reason: 'password_mismatch'
});
```

### Error Events
```javascript
vaultLogger.error('Database error', {
  code: 'DB_001',
  message: 'Connection timeout'
});
```

### Debug Events (development)
```javascript
vaultLogger.debug('File lookup', {
  userId: '123',
  fileId: 'abc'
});
```

## Request Tracing

Every request gets a unique trace ID:

```
Request arrives → correlationId middleware
  ↓
Generates: X-Trace-ID: 550e8400-e29b-41d4-a716-446655440000
  ↓
All logs include this traceId
  ↓
Response includes: X-Trace-ID: 550e8400-e29b-41d4-a716-446655440000
  ↓
Client can use this for support: "My trace ID is ..."
```

### Using Trace IDs
```bash
# Find all logs for a specific request
grep "550e8400-e29b-41d4-a716-446655440000" logs/*.log

# See request flow
cat logs/combined.log | grep "550e8400-e29b-41d4-a716-446655440000"
```

## Feature Flags

Check if feature is enabled for user:

```javascript
const featureFlags = new FeatureFlagEngine();

if (featureFlags.isEnabled('chunkedUpload', user)) {
  // Use chunked upload (beta for 50% of users)
}

// See status
console.log(featureFlags.getStatus());
// {
//   chunkedUpload: { enabled: true, percentage: 100, reason: 'stable' },
//   fileVersioning: { enabled: false, percentage: 0, reason: 'development' },
//   ...
// }
```

## Health Checks

Check system status:

```bash
curl http://localhost:5000/api/health
{
  "status": "healthy|degraded|unhealthy",
  "timestamp": "2024-12-04T10:30:00Z",
  "uptime": 3600,
  "checks": {
    "database": { "status": "healthy", "responseTime": "5ms" },
    "redis": { "status": "healthy", "memory": "5.2MB" },
    "disk": { "status": "healthy", "used": "45.2%", "freeSpace": "230GB" },
    "memory": { "status": "healthy", "percent": "62.3%" },
    "filesystem": { "status": "healthy", "writable": true }
  }
}
```

## Metrics

Get Prometheus-compatible metrics:

```bash
curl http://localhost:5000/api/metrics

# Output: Prometheus text format
# vault_requests_total{endpoint="/api/auth/login",status="200"} 234
# vault_requests_total{endpoint="/api/auth/login",status="401"} 12
# vault_errors_total{code="AUTH_001"} 5
# vault_response_time_ms_p50 42
# vault_response_time_ms_p95 120
# vault_response_time_ms_p99 450
```

## Degradation Status

Check if system is using fallbacks:

```bash
curl http://localhost:5000/api/degradation-status

# If Redis down:
{
  "isDegraded": true,
  "inMemorySessions": 15,
  "cachedItems": 42,
  "message": "Using in-memory sessions (Redis unavailable)"
}
```

## Log Files

- `logs/audit.log` - User actions (upload, download, share, delete)
- `logs/security.log` - Auth failures, token revocations, suspicious activity
- `logs/error.log` - Errors with full context
- `logs/combined.log` - All events

All in JSON format for parsing.

## Error Handling in Routes

### Old Way
```javascript
router.get('/file/:id', async (req, res) => {
  try {
    const file = await getFile(id);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
  } catch (err) {
    logger.error('Error: ' + err.message);
    return res.status(500).json({ error: 'Server error' });
  }
});
```

### New Way
```javascript
router.get('/file/:id', async (req, res, next) => {
  try {
    const file = await getFile(id);
    if (!file) {
      throw new FileNotFoundError('File not found', { fileId: id });
    }
    res.json(file);
  } catch (err) {
    next(err);  // Pass to error handler
  }
});
```

Error handler automatically:
- Logs with error code (FILE_001)
- Sets correct HTTP status (404)
- Returns to client: `{ error: '...', code: 'FILE_001' }`

## Configuration

Set in `.env`:

```
# Log level: debug, info, warn, security, error, audit
LOG_LEVEL=debug

# Health check interval (ms)
HEALTH_CHECK_INTERVAL=60000

# Graceful shutdown timeout (ms)
SHUTDOWN_TIMEOUT=30000

# Feature flags (JSON)
FEATURE_FLAGS='{"chunkedUpload":{"enabled":true,"percentage":100}}'
```

## Database Queries

All logged with traceId:

```
[abc-123] Query: SELECT * FROM files WHERE id = $1
[abc-123] Result: 1 row in 5ms
```

## Response Time Tracking

Automatically tracks all responses:

```
Request:  [abc-123] GET /api/files/list
Response: [abc-123] GET /api/files/list 200 342ms

Metrics collected:
- p50: 120ms
- p95: 450ms
- p99: 800ms
```

## Graceful Shutdown

Process receives SIGTERM (from Docker/Kubernetes):

```
1. Stop accepting new requests
2. Wait up to 30 seconds for in-flight requests
3. Close database connections
4. Flush logs
5. Exit with status 0
```

## Integration Example

```javascript
// routes/files.js
const { FileNotFoundError, FileAccessDeniedError } = require('../utils/vaultErrors');
const vaultLogger = require('../utils/vaultLogger');
const featureFlags = new FeatureFlagEngine();

router.post('/upload', async (req, res, next) => {
  try {
    // Check feature flag
    if (!featureFlags.isEnabled('chunkedUpload', req.user)) {
      throw new ValidationError('Feature disabled');
    }

    // Process upload
    const file = await uploadFile(req.body);

    // Log audit event
    vaultLogger.audit('File uploaded', {
      userId: req.user.userId,
      fileId: file.id
    });

    res.json(file);
  } catch (err) {
    // Error handler catches and returns proper response
    next(err);
  }
});
```

Error handler automatically:
- Sets correct status code
- Logs with error code
- Returns structured response to client
- Includes traceId for debugging
