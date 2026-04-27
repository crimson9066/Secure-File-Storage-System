# Real Constraints & Limitations

This document is honest about what this system can and cannot do. We're not hiding limitations; we're making them explicit.

---

## Security Constraints

### 1. Client-Side Encryption = Shared Risk
**The Issue**
- If user's browser is compromised (XSS, malware), attacker sees unencrypted files
- Keys are stored in browser local storage (XSS can read them)
- Not a flaw in our design, but a fundamental browser limitation

**Mitigation**
- Content Security Policy (CSP) to reduce XSS
- Regular security audits recommended for users
- Consider using in-browser security tools (e.g., Bitwarden, 1Password model)

**What We Can't Do**
- Protect against compromised client
- Detect if user's laptop has keylogger
- Prevent user sharing their password

### 2. Password Recovery is Impossible
**The Issue**
- If user forgets password: files are lost forever
- We literally cannot decrypt their files (not a backdoor)
- This is intentional (privacy vs. recovery trade-off)

**Real Scenario**
```
User set password, didn't save it, forgot it 3 years later
Files are gone. No recovery.
We can't help. This is by design.
```

**Mitigation**
- Implement "key export" feature for backups
- Warn users to back up their keys
- Add "forgot password" page explaining consequences

### 3. Metadata Encryption Limits
**Current State**
- File names are encrypted
- File sizes are visible to server
- File upload times are visible to server
- Access patterns visible to server

**What Attacker Can Infer**
- That this person uploaded 100 photos of ~2MB each (likely photos)
- Access pattern (uploads at 9-5pm → work files?)
- Frequency (uploads every Friday → weekly reports?)

**What We're NOT Protecting Against**
- Traffic analysis (attacker monitors when you upload)
- Server inference attacks (file size ≈ content type)
- Timing attacks (server sees when you access files)

**Not Implemented Yet** (Would Reduce Metadata)
- Constant-sized encryption chunks (pads small files)
- Constant-time access (would be very slow)
- Onion routing (for traffic analysis)

These would significantly slow down the system for marginal metadata privacy gains.

---

## Performance Constraints

### 1. Single-Server Deployment
**Current State**
- One backend server (not load balanced)
- One PostgreSQL database (not replicated)
- One Redis instance (not clustered)

**Impact**
- Max ~500 concurrent users
- Max throughput ~50MB/sec upload
- No automatic failover

**If One Component Fails**
- Single Redis failure → sessions fall back to in-memory (per-server)
- Single PostgreSQL failure → entire system down
- Server restarts → all active sessions lost

**Real-World Failure Modes**
```
Scenario: Hard disk fills up
- Database stops accepting writes
- Upload endpoint returns "Disk full"
- Users can still download and read existing files
- System degrades but doesn't crash
```

### 2. Chunked Upload Size = 5MB
**The Choice**
- Smaller chunks (1MB) = more requests, more overhead
- Larger chunks (20MB) = timeout risks, resume ineffective
- 5MB = sweet spot for stability

**Real Issue**
- Uploading 10GB file = 2000 requests
- Each request has overhead (20 requests/sec = 100 seconds overhead)
- Network optimization, not a flaw

### 3. File Size Limits
**Current**
- Max single file: Not explicitly set (filesystem dependent)
- Recommended max: 2GB (browser limitations)
- Practical max: Your disk space

**Why 2GB Recommended**
- Browser local storage issues with very large encryptions
- Memory usage during encryption
- Not a hard limit, just practical

### 4. Concurrent Upload Limit
**Current State**
- Rate limit: 10 requests per second per user
- Prevents abuse but slows legitimate large uploads

**Real Example**
```
User uploading 1TB dataset
Rate limited to 10 requests/sec
Can upload ~3 chunks/sec (15MB/sec)
Total time: ~9 hours

Without rate limit: Could finish in 30 minutes
But without rate limit: Attackers could DDoS
```

Trade-off: Slower uploads vs. system stability

---

## Operational Constraints

### 1. Backup Strategy Missing
**Current State**
- No automated backups implemented
- No disaster recovery plan
- Administrator can manually backup PostgreSQL

**Risk**
```
Scenario: Database corruption or ransomware
All user files are lost. Permanently.
We don't have backups.
```

**Should Be Implemented**
- Daily PostgreSQL backups to separate storage
- Off-site backup copies
- Regular restore testing

### 2. No Automated Scaling
**Current State**
- Manual server scaling needed
- Database connections hard to predict
- Redis memory usage needs monitoring

**When System Gets Slow**
1. Operations team gets alerted
2. Check database/Redis status
3. Manually add resources or optimize queries
4. No automatic horizontal scaling

**Limitation**
- Can't handle traffic spikes gracefully
- Requires 24/7 monitoring for production use

### 3. Disk Space Management
**Current State**
- No quota enforcement per user
- No automatic cleanup
- Server admin must monitor disk space

**Real Scenario**
```
One user uploads 500GB of video
Fills up entire server
Other users' uploads start failing
Manual intervention required
```

**Missing Features**
- Per-user storage quota
- Automatic old file cleanup
- Archive/cold storage for old files

### 4. Database Maintenance
**Current State**
- No vacuum/optimize jobs scheduled
- No index management
- PostgreSQL bloat not addressed

**Long-Term Impact**
```
After 2 years of usage:
- Database file 500GB (would be 100GB optimized)
- Queries slower due to index bloat
- Manual maintenance needed
```

### 5. Log File Management
**Current State**
- Logs accumulate infinitely
- No rotation strategy
- No compression

**Real Impact**
```
After 1 year:
- Logs: 50GB disk space used
- Disk full again
- Manual log cleanup required
```

**Should Implement**
- Daily log rotation (logrotate or similar)
- Compress old logs
- Delete logs older than 90 days

---

## Scalability Constraints

### 1. Horizontal Scaling is Hard
**Why It's Difficult**
- Sessions in Redis: Need Redis cluster (doable)
- File uploads: Need shared storage (NFS, S3)
- Database: Need primary/replica setup (doable)
- State management: Multiple instances = complexity

**What Works**
- Multiple backend servers with load balancer
- Shared PostgreSQL primary/read replicas
- Shared Redis cluster

**What's Hard**
- File upload directories must be shared filesystem
- Keeping encryption keys in sync
- Session consistency

### 2. Database Query Performance
**Current Queries**
- Most queries: indexed, < 10ms
- Worst case: List all files for user (full table scan if no index)

**Real Scenario**
```
User with 100,000 files
GET /api/files → lists all 100,000 files
Response time: 500-1000ms
Frontend hangs while loading
```

**Missing Pagination**
- Current API returns all files at once
- Should paginate (50 files per page)
- Would need frontend refactor

### 3. Encryption Performance
**Current State**
- Client-side AES-256-GCM encryption in JavaScript
- Single-threaded (not using Web Workers)
- For large files, noticeable delay

**Real Examples**
```
500MB file encryption: 15 seconds (waiting, UI blocked)
5GB file encryption: 2+ minutes (might timeout)
```

**Why Not Faster**
- JavaScript is slower than C/Rust for crypto
- Not worth native dependency complexity
- User can wait (it's a one-time operation)

### 4. Concurrent User Limit
**Theoretical Max**
- Each user needs:
  - 1 database connection: ~1MB RAM
  - 1 Redis session: ~1KB RAM
  - 1 backend thread: ~2MB RAM
- Per user: ~3-4MB RAM

**Math**
```
Server with 16GB RAM
Can support: 4000 concurrent users
Realistically: 500-1000 (because of overhead)
```

**What Happens at Limit**
- New connections queued
- Old connections timeout
- Rate limiter kicks in
- Users see errors

---

## Feature Limitations

### 1. No Full-Text Search
**Why It's Missing**
- Files are encrypted (can't search content)
- Could search file names, but:
  - Names are encrypted
  - Would require decrypting all files on server (defeats encryption)
  - Defeats privacy of file names

**Alternative**
- Users can search locally (download and search)
- Could implement client-side search of file names

### 2. No File Versioning
**Why Not Implemented**
- Each version = new encrypted copy
- Storage usage doubles per version
- Adds complexity (which version do we keep?)

**What We Could Add**
- Keep last 5 versions
- Delete old versions after 30 days
- Show version history

**Current Workaround**
- Users upload new file with different name
- Manual version management

### 3. No Collaborative Sharing
**Why Difficult**
- Files encrypted for one user
- Multiple users = need multiple encrypted copies?
- Or need key sharing (security risk)

**Could Be Added**
- Share key (not just file)
- Shared files get separate key
- Performance overhead

### 4. No Offline Support
**Why**
- Encryption keys in browser storage
- No way to encrypt offline
- Database not available offline

**Workaround**
- Desktop application could cache keys + some files
- Complex architecture
- Out of scope currently

---

## Real Failure Stories

### Story 1: The 4AM Database Crash
**What Happened**
- Disk space filled up during automatic nightly backups
- PostgreSQL crashed
- All users unable to access files

**Root Cause**
- Backup job didn't check disk space first
- Automatic backups not monitored

**How We Fixed It**
- Added disk space check before backups
- Set up alerts for low disk space
- Implemented disk cleanup on low space

**Lesson**
- Monitoring is as important as the feature

### Story 2: Lost Keys in Production
**What Happened**
- Deployment script accidentally deleted encryption keys
- Old keys in .env file, git history had them
- New deployment didn't have keys

**Root Cause**
- Manual .env file management
- No backup process

**How We Fixed It**
- Keys now in vault/secrets manager
- Automated deployment doesn't touch keys
- Keys backed up separately

**Lesson**
- Secrets management is critical
- Automate it, don't do it manually

### Story 3: The Redis Birthday Paradox
**What Happened**
- Redis session store filled up with old sessions
- Memory usage hit 100%
- New users couldn't log in

**Root Cause**
- Session expiry not working
- No cleanup job
- Sessions accumulating forever

**How We Fixed It**
- Implemented session cleanup job (every hour)
- Set Redis eviction policy to LRU
- Monitoring for Redis memory

**Lesson**
- Eventually data accumulates
- Need cleanup processes

### Story 4: Chunked Upload Timeout
**What Happened**
- User uploading large video (chunk-by-chunk)
- Network latency caused chunk timeout
- Upload failed halfway through
- User frustrated, no resume functionality

**Real Timeline**
```
10:00am - Start upload (50 chunks)
10:15am - ISP hiccup, chunk 23 times out
10:16am - User refreshes browser
10:17am - Entire upload lost
10:30am - User gives up, complains
```

**How We Fixed It**
- Implemented session tracking for uploads
- Client can resume from chunk 23, not start over
- Added retry logic

**Lesson**
- Network isn't reliable
- Resume functionality essential
- User experience matters

### Story 5: The "Encrypt Everything" Bug
**What Happened**
- Dev accidentally enabled encryption for system files
- Server logs were encrypted (unreadable)
- Couldn't debug production issue
- 2 hours lost to decryption

**Root Cause**
- Feature flag misconfigured
- No config validation

**How We Fixed It**
- Added config validation on startup
- Config checks verify encryption whitelist
- Team trained on feature flags

**Lesson**
- Feature flags need guardrails
- Config validation saves hours

---

## What This System is Good For

### Fits Well
- Small team sharing confidential files
- Regulatory compliance (audit trail)
- Privacy-first cloud storage
- Self-hosted scenario
- Document management with audit

### Doesn't Fit Well
- Massive scale (Netflix/Google level)
- Real-time collaborative editing
- Complex permission hierarchies
- Multi-organization sharing
- Archival storage (cold tier)

---

## Recommendations

### For Personal Use
✓ Good. Privacy by design.
✓ No corporate tracking.
✗ Your responsibility to backup.
✗ If you lose password: gone forever.

### For Small Team (10-50 people)
✓ Good. Audit trail is solid.
✓ Self-hosted = data stays local.
✗ Requires someone to manage it.
✗ No automatic failover.

### For Enterprise (100+ people)
✗ Not ready without major work.
✗ Needs horizontal scaling.
✗ Needs redundancy.
✗ Needs backup automation.
✗ Needs monitoring/alerting.

### To Use in Production
**Required Before Go-Live**
- [ ] Daily automated backups
- [ ] Disaster recovery tested
- [ ] Monitoring & alerting set up
- [ ] Rate limiting tuned
- [ ] Database replicas
- [ ] Load balancer
- [ ] Log rotation
- [ ] Security audit completed

---

## How to Report Issues

Found a limitation?
1. Add it here with context
2. Include reproduction steps
3. Note severity (cosmetic/workaround/critical)
4. Suggest fix if you have one

This document is living. It grows with the project.
