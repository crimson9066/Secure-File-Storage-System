const { v4: uuidv4 } = require('uuid');
const redis = require('../config/redis');

/**
 * REDIS KEY NAMESPACE STRUCTURE
 * Separate prefixes prevent key collision and aid debugging/monitoring.
 * 
 * All keys use pattern: PREFIX + uploadId + optional index/suffix
 * This makes it easy to find all keys related to an upload (Redis SCAN pattern).
 */
const META_PREFIX = 'upload:meta:'; // JSON metadata: session info (single string)
const CHUNK_PREFIX = 'upload:chunk:'; // Chunk binary data: raw file bytes (string/buffer)
const UPLOADED_SET_PREFIX = 'upload:uploaded:'; // Set of uploaded chunk indices (Redis SET)
const LOCK_PREFIX = 'upload:lock:'; // Finalization lock token (string)

/**
 * EXPIRATION TIME
 * All keys expire after 24 hours (configurable).
 * Balances:
 * - Too short: Legitimate uploads interrupted
 * - Too long: Orphaned session consumes memory
 * - 24 hours: Standard for multi-part uploads
 * 
 * STRATEGIES FOR EXPIRATION:
 * - Per-key TTL (PX): Each key has independent expiration
 * - Redis auto-cleanup: Background eviction when TTL reached
 * - No manual cleanup needed: Redis handles it
 * - Fallback cleanup job: runs hourly but Redis TTL sufficient
 */
const EXPIRE_MS = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

/**
 * KEY GENERATION HELPERS
 * Prevents typos and centralizes key format logic.
 * Makes it easy to change naming scheme without touching all code.
 */
const metaKey = (uploadId) => `${META_PREFIX}${uploadId}`;
const chunkKey = (uploadId, idx) => `${CHUNK_PREFIX}${uploadId}:${idx}`;
const uploadedSetKey = (uploadId) => `${UPLOADED_SET_PREFIX}${uploadId}`;
const lockKey = (uploadId) => `${LOCK_PREFIX}${uploadId}`;

/**
 * CREATE UPLOAD SESSION
 * Initialize new chunked upload session in Redis.
 * 
 * SESSION STRUCTURE:
 * Metadata stored as JSON string in Redis under metaKey.
 * Contains all info needed for chunk validation and finalization.
 * 
 * FIELDS:
 * - uploadId: UUID4 unique identifier for this upload
 * - userId: Owner (prevents cross-user access)
 * - filename: Original filename (client-provided)
 * - totalSize: Expected file size (validation)
 * - totalChunks: Expected number of chunks
 * - chunkSize: Bytes per chunk (except last)
 * - createdAt: Timestamp for audit
 * - expiresAt: When session expires (24 hours hence)
 * 
 * SEPARATE REDIS STRUCTURES:
 * 1. Meta (string): Above JSON metadata
 * 2. Chunks (strings): Each chunk stored separately under chunkKey(uploadId, index)
 * 3. Uploaded set (SET): Indices of chunks received
 * 4. Chunk hashes (strings): SHA-256 of each chunk (optional verification)
 * 5. Lock (string): Finalization lock token (empty = unlocked)
 * 
 * WHY SEPARATE STRUCTURES:
 * - Chunks can be large; fetch only when needed
 * - Uploaded set efficient for checking count/membership
 * - Lock atomic without affecting other keys
 * - Each has independent expiration (all expire together = consistent)
 * 
 * WHY NOT ONE BIG HASH:
 * - Large files: Redis memory pressure from loading entire hash
 * - Partial gets: Can't fetch individual chunks without full hash
 * - Atomic operations: Set members easier to query atomically
 * - Growth during upload: Chunks added incrementally
 * 
 * TTL STRATEGY:
 * - All keys use PX (millisecond precision)
 * - Uploaded set also gets expire() call (set keys don't auto-expire, just members)
 * - If upload abandoned: All keys vanish after 24 hours
 * - If upload completed: Chunk finalize deletes session
 * 
 * Returns: Session metadata object
 */
const createUploadSession = async (userId, filename, totalSize, totalChunks, chunkSize) => {
  const uploadId = uuidv4();
  const now = Date.now();
  const meta = {
    uploadId,
    userId,
    filename,
    totalSize,
    totalChunks,
    chunkSize,
    createdAt: now,
    expiresAt: now + EXPIRE_MS
  };

  // Store session metadata with TTL
  await redis.set(metaKey(uploadId), JSON.stringify(meta), { PX: EXPIRE_MS });
  
  // Initialize empty uploaded set (Redis SET for efficient membership testing)
  // SET members don't have per-member TTL, so set key TTL explicitly
  await redis.expire(uploadedSetKey(uploadId), Math.floor(EXPIRE_MS / 1000));

  return meta;
};

/**
 * GET UPLOAD SESSION
 * Retrieve session metadata and list of uploaded chunks.
 * 
 * RETURNS:
 * - All metadata fields (userId, filename, totalChunks, etc.)
 * - uploadedChunks: Set of chunk indices already uploaded (for progress display)
 * 
 * USAGE:
 * - Validation: Check if session valid and belongs to user
 * - Progress: Count uploaded chunks to show %
 * - Verification: Compare uploaded vs total chunks
 * 
 * DATA CONSISTENCY:
 * - Meta and set may be out of sync briefly (no transaction)
 * - Not a problem: Chunks can always be re-uploaded
 * - Worst case: Client retries /chunk/append if session disappeared
 * 
 * PERFORMANCE:
 * - O(1) for meta get
 * - O(n) for set members (n = uploaded chunks, usually small)
 * - Acceptable for typical upload (hundreds of chunks max)
 * 
 * Returns: Session object with uploadedChunks Set, or null if not found
 */
const getUploadSession = async (uploadId) => {
  const raw = await redis.get(metaKey(uploadId));
  if (!raw) return null;
  const meta = JSON.parse(raw);

  // Fetch set of uploaded chunk indices
  const uploaded = await redis.sMembers(uploadedSetKey(uploadId));
  const uploadedSet = new Set(uploaded.map(Number));

  return Object.assign({}, meta, { uploadedChunks: uploadedSet });
};

/**
 * RECORD CHUNK UPLOAD
 * Store chunk data and mark it as uploaded.
 * 
 * ATOMIC OPERATIONS (in practical sense):
 * 1. Store chunk binary (Redis STRING)
 * 2. Store chunk hash (SHA-256)
 * 3. Add index to uploaded set
 * 4. Set TTL on uploaded set
 * 
 * WHY CHUNK HASH STORED:
 * - Client computed SHA-256 of chunk
 * - Server stores for verification at finalization (optional)
 * - Detects corruption in transit (bit flip in transport)
 * - Not verified here; just stored for finalize step
 * 
 * REDIS STORAGE DETAILS:
 * - Chunk key: `upload:chunk:{uploadId}:{index}` stores raw binary
 * - Hash key: `upload:chunk:{uploadId}:{index}:hash` stores SHA-256
 * - Both keys same TTL (expire together)
 * 
 * UPLOADED SET:
 * - ADD chunk index to set for fast membership testing
 * - When finalizing: Can check sCard(set) vs totalChunks
 * - Can check if specific index missing: NOT sIsMember
 * - Reset TTL on each add (keeping alive while chunks arrive)
 * 
 * IDEMPOTENCY:
 * - Re-uploading same chunk index: Overwrites previous chunk (OK)
 * - SADD idempotent: Adding duplicate index is no-op (OK)
 * - Supports retry-ability: Client can safely retry /chunk/append
 * 
 * ERROR HANDLING:
 * - Check if meta exists (session validity)
 * - Don't validate chunk size (trust init size agreement)
 * - Don't verify hash (stored only, checked at finalize)
 * 
 * Returns: true if recorded, false if session not found
 */
const recordChunkUpload = async (uploadId, chunkIndex, chunkData, chunkHash) => {
  const metaRaw = await redis.get(metaKey(uploadId));
  if (!metaRaw) return false;

  // Store chunk binary data with TTL
  const key = chunkKey(uploadId, chunkIndex);
  await redis.set(key, chunkData, { PX: EXPIRE_MS });

  // Store chunk hash (SHA-256) for optional verification
  await redis.set(`${key}:hash`, chunkHash, { PX: EXPIRE_MS });

  // Mark this chunk index as uploaded (for progress tracking)
  await redis.sAdd(uploadedSetKey(uploadId), String(chunkIndex));
  
  // Refresh TTL on uploaded set (keeps session alive while uploading)
  await redis.expire(uploadedSetKey(uploadId), Math.floor(EXPIRE_MS / 1000));

  return true;
};

/**
 * DELETE UPLOAD SESSION
 * Complete cleanup: Remove session metadata, all chunks, and uploaded set.
 * 
 * CALLED:
 * - After finalize success (chunks assembled into file)
 * - By manual cleanup if session abandoned
 * - Not called if upload fails (session remains for retry)
 * 
 * CLEANUP STEPS:
 * 1. Delete meta (prevents new chunks arriving)
 * 2. Delete all chunk binaries (frees memory)
 * 3. Delete all chunk hashes (cleanup)
 * 4. Delete uploaded set (cleanup)
 * 
 * REDIS KEYS DELETED:
 * - metaKey: Immediately stops accepting new chunks
 * - chunkKey(*, idx): One for each uploaded chunk
 * - chunkKey(*, idx):hash: One for each uploaded chunk
 * - uploadedSetKey: Once, clears entire set
 * 
 * EFFICIENCY:
 * - Collect all keys first
 * - Use MGET/DEL for batch deletion
 * - Redis pipeline friendly (combine multiple DEL calls)
 * 
 * IDEMPOTENCY:
 * - Calling multiple times is safe
 * - DEL on non-existent keys is no-op
 * - First call succeeds; subsequent calls do nothing
 * 
 * WHY NOT SCAN+DEL:
 * - Smaller operation: Likely <1000 chunks per upload
 * - Deterministic: Know exact keys to delete
 * - Faster: No scanning needed
 * 
 * Returns: None
 */
const deleteUploadSession = async (uploadId) => {
  // Delete session metadata
  await redis.del(metaKey(uploadId));

  // Collect all chunk keys to delete
  const uploaded = await redis.sMembers(uploadedSetKey(uploadId));
  const keys = [];
  for (const idx of uploaded) {
    keys.push(chunkKey(uploadId, idx));
    keys.push(`${chunkKey(uploadId, idx)}:hash`);
  }
  keys.push(uploadedSetKey(uploadId));

  // Batch delete all chunk keys
  if (keys.length) await redis.del(...keys);
};

/**
 * ACQUIRE LOCK (FOR FINALIZATION)
 * Implement distributed lock using Redis atomic SET NX.
 * 
 * LOCK SEMANTICS:
 * - Key: lockKey(uploadId) = `upload:lock:{uploadId}`
 * - Value: UUID token (distinguishes lock holders)
 * - NX: Only set if key doesn't exist (atomic acquire)
 * - PX: TTL in milliseconds (prevents deadlock)
 * 
 * HOW IT WORKS:
 * 1. Server A calls acquireLock(uploadId, 30000)
 * 2. Redis executes: SET key token NX EX 30
 * 3. If key empty: SET succeeds, returns 1 (lock acquired)
 * 4. If key exists: SET fails, returns null (lock held)
 * 5. Server A gets token; Server B gets null
 * 6. Server A proceeds with finalization
 * 7. Server B returns 423 (Locked) to client
 * 8. Client retries; Server A finished, lock expired or released
 * 
 * WHY UUID TOKEN:
 * - Prevents lock hijacking
 * - Only lock holder can release (releaseLock checks token)
 * - If Server A crashes: Token doesn't match, Server B can wait for TTL
 * - If Server B force-releases: Would need correct token (can't)
 * 
 * TTL (30 SECONDS):
 * - Finalization should complete quickly (seconds)
 * - 30 seconds is conservative timeout
 * - If server crashes: Lock auto-releases after 30s
 * - Client can retry after 30s (OK trade-off)
 * 
 * ALTERNATIVES:
 * - GETSET (deprecated): Replaced by SET NX/XX in modern Redis
 * - SETNX: Old function, deprecated (SET NX is preferred)
 * - Redis Lua script: Overkill for this use case
 * - Distributed lock library (Redlock): Overkill for single Redis
 * 
 * IDEMPOTENCY:
 * - Only one caller acquires lock (atomic SET NX)
 * - Others get null and fail fast (no spinning)
 * - No retry loop; client-side handles retry
 * 
 * Returns: UUID token if lock acquired, null if lock held
 */
const acquireLock = async (uploadId, ttl = 30000) => {
  const key = lockKey(uploadId);
  const token = uuidv4();
  // SET NX EX: Only set if not exists, with TTL
  const ok = await redis.set(key, token, { NX: true, PX: ttl });
  return ok ? token : null;
};

/**
 * RELEASE LOCK
 * Release lock only if token matches (prevents wrong party releasing).
 * 
 * SAFETY:
 * - Fetch current value
 * - Verify matches provided token
 * - Only then delete
 * 
 * WHY TOKEN CHECK:
 * - Prevents accidental release by someone else
 * - If Server A's token is "abc" and releases
 * - Server B cannot guess "abc" (UUID is random)
 * - Server B's token "def" doesn't match
 * 
 * NOT ATOMIC (GET + DEL):
 * - Between GET and DEL: Another process could change key
 * - Not a problem: If key changed, release fails (expected)
 * - Returns false to indicate failed release (already released)
 * 
 * WHY NOT SCRIPT/ATOMIC:
 * - Simple use case: GET is fast
 * - Race condition acceptable: Only lock holder calls this
 * - If concurrent release: One succeeds, one gets false (OK)
 * - GETDEL could be used in newer Redis (atomic get+delete)
 * 
 * CALLED FROM:
 * - finalize() in finally block (always runs)
 * - Don't care if release fails (token mismatch = already released)
 * - .catch(() => {}) swallows errors
 * 
 * Returns: true if released, false if token mismatch
 */
const releaseLock = async (uploadId, token) => {
  const key = lockKey(uploadId);
  const cur = await redis.get(key);
  if (cur && cur === token) {
    await redis.del(key);
    return true;
  }
  return false;
};

/**
 * GET CHUNK DATA
 * Retrieve uploaded chunk binary data by index.
 * 
 * RETURNS:
 * - Buffer if chunk exists
 * - null if chunk not found
 * 
 * REDIS TYPE HANDLING:
 * - Redis returns Buffer by default (with ioredis client)
 * - Fallback: If string returned, convert to Buffer
 * - Handles both cases gracefully
 * 
 * USAGE:
 * - Called during finalization to assemble file
 * - Used in loop: for (let i = 0; i < totalChunks; i++)
 * - Write each chunk to disk output stream
 * 
 * PERFORMANCE:
 * - O(1) lookup by key
 * - Network I/O: Chunk size determines bandwidth
 * - Memory: Chunk loaded once, written to disk, released
 * 
 * SAFETY:
 * - Called after lock acquired (no concurrent deletion)
 * - Session checked before finalize (chunks won't expire mid-finalize)
 * - 30-second lock longer than finalize (safe window)
 * 
 * Returns: Buffer containing chunk data, or null if not found
 */
const getChunkData = async (uploadId, idx) => {
  const key = chunkKey(uploadId, idx);
  const data = await redis.get(key);
  if (!data) return null;
  if (Buffer.isBuffer(data)) return data;
  // Fallback: Redis client may return string; convert safely
  return Buffer.from(data, 'binary');
};

/**
 * GET UPLOADED COUNT
 * Determine how many chunks have been uploaded.
 * 
 * USAGE:
 * - Progress tracking: (count / total) * 100 = % complete
 * - Validation: All chunks present? count == total
 * - Client poll endpoint: Show progress bar
 * 
 * OPERATION:
 * - SCARD uploaded set
 * - O(1) operation (set size maintained)
 * - Returns integer count
 * 
 * ATOMICITY:
 * - Single Redis operation (atomic)
 * - If chunks being added: Returns current count (may increase next call)
 * - Not a problem: Progress tracking is approximate (based on client clock)
 * 
 * Returns: Number of uploaded chunks (integer)
 */
const getUploadedCount = async (uploadId) => {
  return await redis.sCard(uploadedSetKey(uploadId));
};

/**
 * CLEANUP EXPIRED SESSIONS
 * Background job to remove abandoned uploads after TTL.
 * 
 * WHY NEEDED:
 * - Redis TTL auto-cleanup works, but runs on eviction policy
 * - With TTL set on all keys: Natural expiration is sufficient
 * - This function is mostly defensive / audit trail
 * 
 * CURRENT IMPLEMENTATION:
 * - No-op: Redis TTL handles everything
 * - Kept for compatibility with potential future changes
 * - Could add explicit cleanup logic if needed:
 *   - SCAN upload:meta:* with cursor
 *   - Check TTL on each
 *   - DEL expired entries
 * 
 * RUN SCHEDULE:
 * - Called every hour from routes/chunked.js setInterval
 * - Lightweight: Currently no-op
 * - Could be enhanced later if issue discovered
 * 
 * ALTERNATIVES:
 * - Redis SCAN with cursor (SCAN scan-iterator pattern)
 * - Separate background worker process
 * - Hook into Redis eviction events
 * 
 * Returns: None
 */
const cleanupExpiredSessions = async () => {
  // Redis TTL (PX) automatically removes keys when expired.
  // No manual cleanup needed; this is here for extensibility.
  return;
};

module.exports = {
  createUploadSession,
  getUploadSession,
  recordChunkUpload,
  deleteUploadSession,
  cleanupExpiredSessions,
  acquireLock,
  releaseLock,
  getChunkData,
  getUploadedCount
};

module.exports = {
  createUploadSession,
  getUploadSession,
  recordChunkUpload,
  deleteUploadSession,
  cleanupExpiredSessions,
  acquireLock,
  releaseLock,
  getChunkData,
  getUploadedCount
};
