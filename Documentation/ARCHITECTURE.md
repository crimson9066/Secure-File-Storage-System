# Architecture Decision Records (ADRs)

## Overview
This document tracks architectural decisions made during development. It explains the "why" behind tech choices, not just the "what".

---

## ADR-001: Custom Error Classes Instead of Generic Error Throws

**Date**: 2024
**Status**: Accepted (Implemented)

### Problem
Early implementation threw generic `Error` objects throughout the codebase. This made debugging difficult:
- No way to distinguish between different error types programmatically
- Log files had no error codes for searching
- Client couldn't tell if error was auth, file, or encryption related
- Same error message appeared everywhere, unhelpful

### Solution
Created `VaultError` base class with 23 domain-specific subclasses:
- `AuthenticationError` (code: AUTH_001-003)
- `FileNotFoundError` (code: FILE_001-003)
- `EncryptionError` (code: ENC_001-003)
- `ValidationError` (code: VAL_001-003)
- etc.

Each error includes:
- Unique error code (e.g., AUTH_001) for log searching
- HTTP status code for client
- Detailed error object for debugging
- Timestamp and stack trace

### Example
```javascript
// Before: Unhelpful error
throw new Error('Invalid token');

// After: Traceable error
throw new InvalidTokenError('Token expired', { token: tokenId });
// Generates: {
//   code: 'AUTH_002',
//   statusCode: 401,
//   message: 'Token expired',
//   details: { token: tokenId },
//   timestamp: '2024-01-15T10:30:00Z'
// }
```

### Benefits
- Error code appears in logs → can search for all AUTH_002 errors
- Client app can handle specific error types
- Developers can trace errors across log files
- Each error has consistent structure

### Trade-offs
- More files/classes to maintain (mitigated by good organization)
- Slightly more memory per error (negligible)

---

## ADR-002: Request Correlation IDs (X-Trace-ID)

**Date**: 2024
**Status**: Accepted (Implemented)

### Problem
When users reported issues, we couldn't trace their request through logs. Multiple requests from same user mixed together. Debugging multi-step operations (upload chunks, encryption, storage) impossible.

### Solution
Implemented X-Trace-ID middleware:
- Client can send `X-Trace-ID` header or middleware generates UUID
- Every log entry includes traceId
- Response includes X-Trace-ID header so client knows their trace ID
- Tracks request duration automatically

### Example Use Case
User reports "upload failed halfway through"
```
1. We ask for trace ID from their browser console: X-Trace-ID: abc-123
2. grep logs for "abc-123"
3. See: chunk 1 uploaded, chunk 2 uploaded, chunk 3 encryption failed (ENC_002)
4. Now we know exactly where it failed
```

### Implementation Details
```javascript
// Middleware logs: [abc-123] POST /api/files (200ms)
// Chunk middleware logs: [abc-123] Chunk 3 encrypted with AES-256-GCM
// Error middleware logs: [abc-123] ENC_002 Decryption failed
```

### Benefits
- Follow single request through entire system
- Multi-server debugging possible (trace follows request)
- Performance monitoring per user
- Easier customer support ("send us your trace ID")

### Trade-offs
- Adds ~10ms per request for UUID generation + logging (negligible)
- Uses ~50 bytes RAM per active request (acceptable)

---

## ADR-003: Feature Flags for Gradual Rollout

**Date**: 2024
**Status**: Accepted (Implemented)

### Problem
New features like WebSocket progress or collaborative sharing are risky:
- Can't safely deploy to 100% of users
- No way to A/B test with real users
- If feature breaks, all users affected

### Real-World Scenario
We built end-to-end metadata encryption but were worried about bugs. Couldn't:
- Test with select power users first
- Gradually enable for 10% → 50% → 100%
- Disable instantly if issues found

### Solution
Feature flag system with:
```javascript
{
  chunkedUpload: {
    enabled: true,
    percentage: 100,  // Enabled for everyone
    reason: 'Stable in production'
  },
  
  endToEndMetadataEncryption: {
    enabled: true,
    percentage: 50,  // Only 50% of users
    reason: 'Beta testing, 50% rollout'
  },
  
  webSocketProgress: {
    enabled: false,
    reason: 'Development in progress'
  }
}
```

### How It Works
Hash-based rollout ensures same user always gets same feature:
```javascript
const hash = hashFunction(userId + featureName);
const rolloutPercent = hash % 100;
if (rolloutPercent < feature.percentage) {
  // User gets feature
}
```

### Benefits
- Safe to deploy new features
- Can monitor errors per feature
- Easy to disable bad feature
- Real user testing with subset

### Real Scenario
If `endToEndMetadataEncryption` has bugs:
1. Set percentage to 10% to limit damage
2. Fix bugs
3. Increase to 50%
4. Monitor for 24 hours
5. Roll out to 100%

---

## ADR-004: Custom Logger with Audit Levels

**Date**: 2024
**Status**: Accepted (Implemented)

### Problem
Generic logging (info/warn/error) isn't enough for security audit:
- Compliance requires audit trail of who did what
- Need security events separate from regular logs
- Can't query "all failed auth attempts" easily

### Solution
Custom Winston logger with 5 levels:
```javascript
0: 'audit'    // Who accessed what (compliance requirement)
1: 'security' // Failed auth, permission denials (alerts)
2: 'error'    // System errors (DEBUG priority)
3: 'warn'     // Warnings (can be noisy)
4: 'info'     // General info
5: 'debug'    // Detailed debug (development only)
```

### Real Use Case
```javascript
// Audit log (compliance)
logger.audit('User john@example.com downloaded file_id_123', {
  userId: '456',
  fileId: '123',
  timestamp: '2024-01-15T10:30:00Z'
});

// Security log (alert)
logger.security('Failed login attempt from IP 192.168.1.1', {
  email: 'hacker@evil.com',
  ip: '192.168.1.1',
  attempts: 3
});

// Error log (debugging)
logger.error('Database connection failed', { error: err });
```

### Benefits
- Separate audit.log for compliance
- Separate security.log for alerts
- Can easily find "all security events"
- JSON format for machine parsing
- Meets audit requirements

---

## ADR-005: In-Memory Session Fallback (Graceful Degradation)

**Date**: 2024
**Status**: Accepted (Implemented)

### Problem
Real incident: Redis crashed at 2am on Saturday. Users couldn't log in. System was down for 30 minutes while Redis restarted.

### Root Cause
Sessions stored ONLY in Redis. When Redis went down, sessions were lost.

### Solution
Graceful degradation:
```javascript
// Try Redis first (fast, works horizontally)
try {
  const session = await redis.get(sessionId);
} catch (err) {
  // Redis down, fall back to in-memory
  const session = inMemorySessions.get(sessionId);
}
```

### How It Helps
When Redis fails:
1. Sessions fall back to in-memory storage (per server)
2. Users stay logged in on same server
3. Can gradually restart Redis without taking users offline
4. Health check alerts ops team

### Important Limitations
- **Only works for single server**
- If users load balance across servers and original server dies, they're logged out
- Acceptable for small deployments (ours)
- For multi-server, would need shared fallback store

### Real Scenario
```
2:00am - Redis crashes
2:01am - Middleware detects redis down, uses in-memory fallback
2:05am - Ops team wakes up to alert
2:30am - Redis restarted
2:31am - Queries go back to Redis, in-memory cache cleared
```

Without this, users would have been logged out at 2:00am.

---

## ADR-006: Why Chunked Upload Instead of Direct

**Date**: 2024
**Status**: Accepted

### Problem
Large file uploads are fragile:
- Network hiccup = start over from beginning (20GB upload lost)
- No way to resume
- User can't see progress
- Uploading large file blocks everything else

### Solution
Chunked upload with session tracking:
1. Split file into 5MB chunks
2. Upload each chunk independently
3. Server tracks which chunks received
4. If chunk fails, only re-upload that chunk
5. Client can resume mid-upload

### Example
```
User uploads 500MB file

Chunk 1 (5MB) - uploaded ✓
Chunk 2 (5MB) - uploaded ✓
Chunk 3 (5MB) - network timeout ✗
... browser crash ...

User refreshes page, resumes:
Chunks 1-2 already on server ✓
Only re-upload chunk 3
Chunk 4-100 upload

Total time: ~5 minutes instead of starting over
```

### Benefits
- Resume after interruption
- Real-time progress UI
- Doesn't block application
- Parallelizable (multiple chunks at once)

### Implementation Detail
Each chunk is:
1. Encrypted client-side with AES-256-GCM
2. Uploaded with session ID + chunk number
3. Server verifies MAC integrity
4. When all chunks done, server concatenates and stores

---

## ADR-007: AES-256-GCM for Client-Side Encryption

**Date**: 2024
**Status**: Accepted

### Why This Choice
- **AES-256-GCM**: Industry standard, authenticated encryption (prevents tampering)
- **Client-side**: Even we (server) can't read files
- **GCM mode**: Includes authentication tag (detects corruption/tampering)

### What We Tried (Failed)
- First version used basic AES-256-CBC (no authentication)
- Client could upload corrupted encrypted files
- Server couldn't detect tampering
- Switched to GCM to add authentication

### Key Management
- Each file has unique AES key
- Keys stored in browser local storage (risks: XSS could read them)
- Better solution: RSA key wrapping (plan for future)

### Limitation
- User loses password = loses all files
- We physically cannot decrypt
- Trade-off: Privacy vs. recovery

---

## ADR-008: PostgreSQL + Redis for Session Management

**Date**: 2024
**Status**: Accepted

### Architecture
- **PostgreSQL**: Persistent file metadata, users, audit trail
- **Redis**: Session store (fast, volatile)

### Why Not Just PostgreSQL?
- Session lookups would hit database on every request (slow)
- Database would be bottleneck
- Redis is 1000x faster for session reads

### Why Not Just Redis?
- Data not persistent (power loss = data gone)
- Can't run audit queries on Redis
- Need relationship queries (which files owned by user X)

### Real Trade-off
```
Scenario: Server restarts
- Sessions in Redis = users logged out (bad)
- But file data in PostgreSQL = not lost (good)
- Trade-off: Acceptable. Sessions are temporary.
```

---

## ADR-009: JWT for Authentication (Not Session Cookies)

**Date**: 2024
**Status**: Accepted (With Token Revocation)

### Problem With JWT
- Can't revoke tokens immediately (they're valid until expiration)
- If user's password compromised, old tokens still work

### Our Solution
- Short-lived JWT (1 hour)
- Refresh tokens (7 days) in Redis
- Token revocation list in Redis
- Check revocation list on every request

### How Revocation Works
```
User clicks "Logout"
1. Delete refresh token from Redis
2. Add JWT to revocation list (24 hours)
3. JWT still valid but marked as revoked
4. Server checks revocation list before trusting JWT
5. After 24 hours, JWT expires naturally + removed from list
```

### Benefits
- Can revoke compromised tokens instantly
- Still get JWT performance (don't hit DB every request)
- Refresh tokens can be long-lived for mobile apps

### Cost
- Redis memory for revocation list (manageable)
- Extra revocation check per request (negligible)

---

## Technical Debt & Known Limitations

### Current Issues
1. **RSA Key Storage**: Keys in code, should be in environment
2. **No Multi-Server Failover**: In-memory sessions don't work across servers
3. **Disk Space**: No quota enforcement per user
4. **Rate Limiting**: Global rate limit, not per-user
5. **Search**: Can't search file contents (encrypted anyway)

### Why We Accept These
- Acceptable for single-server deployment
- Would address for multi-million user system
- Core security is solid

### Future Improvements
- Hardware security module (HSM) for key storage
- Distributed session store (Redis cluster)
- Database replication + read replicas
- Kubernetes deployment for horizontal scaling
- Prometheus metrics + alerts

---

## Lessons Learned

### What We Got Right
- End-to-end encryption works
- Chunked uploads reliable
- Security model sound

### What We'd Do Differently
- Use environment variables for secrets from day 1
- Plan for horizontal scaling early
- Implement request tracing earlier (helped debugging)
- Feature flags from start (safer deployments)

### What Surprised Us
- Rate limiting more important than expected (bots, scrapers)
- File deduplication tempting but risky (privacy concern)
- Session management more complex than expected with encryption

---

## How to Update This Document

When making architectural decisions:
1. Create new ADR-NNN section
2. Document problem, solution, benefits, trade-offs
3. Include real examples or scenarios
4. Link to relevant code files
5. Update date and status (Proposed/Accepted/Deprecated)

This document lives with the code and evolves with it.
