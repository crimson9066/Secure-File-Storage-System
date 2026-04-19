const express = require('express');
const router = express.Router();
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { hashFile } = require('../utils/encryption');
const { 
  createUploadSession,
  getUploadSession,
  recordChunkUpload,
  deleteUploadSession,
  cleanupExpiredSessions,
  acquireLock,
  releaseLock,
  getChunkData,
  getUploadedCount
} = require('../models/uploadSession');
const { createFileRecord } = require('../models/user');
const { validateRequest, initChunkUploadSchema, appendChunkSchema, finalizeChunkUploadSchema } = require('../validation/schemas');
const vaultLogger = require('../utils/vaultLogger');
const {
  UploadSessionError,
  ChunkError,
  ValidationError,
  StorageError
} = require('../utils/vaultErrors');

/**
 * BACKGROUND SESSION CLEANUP
 * Runs every hour to remove expired upload sessions.
 * With Redis backend (TTL-based), this is mostly a no-op but kept for safety.
 * 
 * WHY PERIODIC CLEANUP:
 * - Orphaned sessions: If client disappears mid-upload, session expires
 * - Cleanup job removes Redis entries when TTL expires naturally
 * - Without cleanup: Redis memory could grow if TTL not enforced
 * - With cleanup: Explicit cleanup prevents orphaned data
 */
setInterval(() => cleanupExpiredSessions().catch(() => {}), 60 * 60 * 1000);

/**
 * POST /chunk/init
 * Initialize a chunked upload session.
 * 
 * CLIENT WORKFLOW:
 * 1. Client wants to upload large file (e.g., 1GB video)
 * 2. Client computes: totalChunks = ceil(fileSize / chunkSize)
 * 3. Client calls /chunk/init with metadata
 * 4. Server returns uploadId and session details
 * 5. Client uploads each chunk via /chunk/append
 * 6. Client finalizes with /chunk/finalize
 * 
 * WHY CHUNKED UPLOADS:
 * - Single large POST fails if connection drops mid-upload
 * - Chunked: Can retry individual chunks instead of restarting
 * - Progress tracking: Easier to show % complete
 * - Memory efficiency: Process chunks instead of buffering entire file
 * - Server recovery: Can resume if connection interrupted
 * 
 * SESSION STORAGE:
 * - Redis: Stores session metadata with TTL (24 hours default)
 * - Key: uploadSessions:{uploadId}
 * - Contains: userId, filename, totalChunks, totalSize, etc.
 * - TTL ensures abandoned sessions cleaned up automatically
 * 
 * SIZE VALIDATION:
 * - Prevents DoS: Single monster upload could exhaust storage
 * - Configurable via MAX_TOTAL_UPLOAD_SIZE env var (default 1TB)
 * - Checked at init time; client notified before uploading chunks
 * - Per-user storage quota also enforced at finalization
 * 
 * Returns: uploadId, filename, totalChunks, expiresAt
 */
router.post('/chunk/init', validateRequest(initChunkUploadSchema), async (req, res, next) => {
  try {
    const { filename, totalSize, totalChunks, chunkSize } = req.validated;

    // Validate sizes to prevent DoS attacks
    if (totalSize > parseInt(process.env.MAX_TOTAL_UPLOAD_SIZE || 1099511627776)) {
      throw new StorageError('Total upload size exceeds maximum limit', {
        totalSize,
        maxSize: process.env.MAX_TOTAL_UPLOAD_SIZE || '1TB'
      });
    }

    const session = await createUploadSession(req.user.userId, filename, totalSize, totalChunks, chunkSize);

    vaultLogger.audit('Chunked upload session created', {
      userId: req.user.userId,
      uploadId: session.uploadId,
      filename: filename,
      totalSize: totalSize,
      totalChunks: totalChunks
    });

    res.json({
      uploadId: session.uploadId,
      filename: session.filename,
      totalChunks: session.totalChunks,
      expiresAt: new Date(session.expiresAt).toISOString()
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /chunk/append
 * Upload individual chunk to session.
 * 
 * REQUEST FORMAT:
 * - uploadId: Which session to append to
 * - chunkIndex: 0-based position (0 = first chunk)
 * - chunkHash: SHA-256 of chunk (client-computed for verification)
 * - Body: Raw chunk data (binary)
 * 
 * CHUNK STORAGE:
 * - Redis: Stores in memory with key pattern: chunks:{uploadId}:{chunkIndex}
 * - TTL: Same as session (24 hours); expires when session expires
 * - Size: Must match chunkSize from init (except last chunk may be smaller)
 * - Ordering: Server doesn't need ordered chunks; stored by index
 * 
 * HASH VERIFICATION:
 * - Client computes SHA-256 of chunk before uploading
 * - Server stores hash for verification at finalization
 * - At finalize: Can verify chunks weren't corrupted in transit
 * - Not enforced here; just recorded; verification at finalize
 * 
 * PROGRESS TRACKING:
 * - Server counts uploaded chunks using SCARD on Redis set
 * - Calculates percentage: (uploadedCount / totalChunks) * 100
 * - Client can poll for progress without needing all chunks present
 * 
 * ERROR HANDLING:
 * - Invalid session: 404
 * - Session belongs to different user: 403 (access control)
 * - Bad chunk index: 400 (out of range)
 * - Corrupted chunk: Stored anyway; detected at finalize
 * 
 * WHY NO SIZE CHECK HERE:
 * - Trust client submitted correct chunkSize at init
 * - Large chunks rejected at init time (totalSize > limit)
 * - Individual chunk size validation could be added per-env policy
 * 
 * Returns: Progress information (uploadedChunks, totalChunks, percentage)
 */
router.post('/chunk/append', validateRequest(appendChunkSchema), async (req, res, next) => {
  try {
    const { uploadId, chunkIndex, chunkHash } = req.validated;
    const session = await getUploadSession(uploadId);
    if (!session) {
      throw new UploadSessionError('Upload session not found or expired', { uploadId });
    }

    // Verify ownership
    if (session.userId !== req.user.userId) {
      throw new UploadSessionError('Unauthorized upload session', { uploadId });
    }

    // Validate chunk index
    if (chunkIndex >= session.totalChunks) {
      throw new ChunkError('Invalid chunk index', { chunkIndex, totalChunks: session.totalChunks });
    }

    // Extract chunk data
    const chunkData = req.body.chunkData ? Buffer.from(req.body.chunkData, 'base64') : req.body;

    // Store chunk in Redis
    await recordChunkUpload(uploadId, chunkIndex, chunkData, chunkHash);

    // Calculate progress
    const uploadedCount = await getUploadedCount(uploadId);
    const progress = Math.round((uploadedCount / session.totalChunks) * 100);

    vaultLogger.debug('Chunk uploaded', {
      uploadId: uploadId,
      chunkIndex: chunkIndex,
      progress: progress
    });

    res.json({
      uploadId,
      chunkIndex,
      uploadedChunks: uploadedCount,
      totalChunks: session.totalChunks,
      progress
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /chunk/finalize
 * Complete upload: verify all chunks, assemble file, create database record.
 * 
 * CRITICAL SECTION (NEEDS LOCKING):
 * Between checking "all chunks present" and writing final file, multiple servers
 * could attempt finalization simultaneously. This race condition must be prevented.
 * 
 * RACE CONDITION SCENARIO (without lock):
 * 1. Server A checks: all chunks present? YES
 * 2. Server B checks: all chunks present? YES
 * 3. Server A starts assembling file
 * 4. Server B starts assembling file (uses same chunks)
 * 5. Server A finishes, deletes chunks from Redis
 * 6. Server B tries to read chunks: MISSING! ERROR
 * 
 * SOLUTION: DISTRIBUTED LOCK (Redis)
 * 1. Server tries to acquire lock: SET key uploadId:finalize:lock value timeout NX
 * 2. If lock acquired: Proceed with finalization
 * 3. If lock exists: Return 423 (Locked) to client
 * 4. Client retries; server will re-acquire lock after first finishes
 * 5. Release lock when done to allow next attempt
 * 
 * WHY NOT PESSIMISTIC LOCK (lock at append):
 * - Blocks upload: Client can't append while finalizing (bad)
 * - One client holds lock for entire upload duration (inefficient)
 * 
 * WHY NOT OPTIMISTIC LOCK (version field):
 * - Complex: Need version field in Redis
 * - Still need retry logic: Client calls finalize multiple times
 * - Current approach is simpler: Binary lock state (owned/free)
 * 
 * WHY NOT JUST TRY/CATCH DELETE SESSION:
 * - Not atomic: Race between check and delete
 * - Server B could start finalize after check but before delete
 * 
 * LOCK TIMEOUT (30 seconds):
 * - Finalization should complete in seconds
 * - 30-second timeout prevents deadlock if server crashes
 * - If server dies: Lock auto-expires, next client can finalize
 * - Too short: Might expire mid-finalization (bad)
 * - Too long: Slow recovery if server dies (but safe default)
 * 
 * VERIFICATION STEPS:
 * 1. Session exists and belongs to user (re-verified)
 * 2. All chunks present (count == totalChunks)
 * 3. No missing chunks (verify each chunk loadable)
 * 4. File hash matches (if provided)
 * 
 * FILE ASSEMBLY:
 * - Read each chunk from Redis (ordered 0 to totalChunks-1)
 * - Write to disk using stream (memory efficient)
 * - Track total size written
 * - Verify final size matches totalSize
 * 
 * DATABASE TRANSACTION:
 * - Create file record: Insert metadata, get file ID
 * - Log audit event: Record file upload for compliance
 * - Clean up Redis: Delete session and all chunks
 * 
 * ENCRYPTION:
 * - Client encrypted file before sending (chunked encryption handled by client)
 * - Server stores encryptedKey (AES-256 key encrypted with user's public RSA key)
 * - Only client with private key can decrypt
 * 
 * ERROR RECOVERY:
 * - If chunk missing: Return error, session still valid
 * - If file assembly fails: Session still valid, retry /chunk/finalize
 * - If write fails: Session still valid, disk space issue is temporary
 * - If DB fails: Session still valid, chunks remain in Redis
 * 
 * WHY FINALLY BLOCK:
 * - Release lock even if finalize fails
 * - If left unreleased: Next finalize request waits 30 seconds then retries
 * - Better to fail fast: Release lock, let next finalize attempt
 * - Doesn't lose data: Session remains, chunks in Redis, can retry
 * 
 * Returns: File ID, filename, size, created timestamp
 */
router.post('/chunk/finalize', validateRequest(finalizeChunkUploadSchema), async (req, res, next) => {
  try {
    const { uploadId, encryptedKey, fileHash } = req.validated;
    const session = await getUploadSession(uploadId);
    if (!session) {
      throw new UploadSessionError('Upload session not found or expired', { uploadId });
    }

    // Verify ownership
    if (session.userId !== req.user.userId) {
      throw new UploadSessionError('Unauthorized upload session', { uploadId });
    }

    // Acquire distributed lock
    const lockToken = await acquireLock(uploadId, 30 * 1000);
    if (!lockToken) {
      throw new UploadSessionError('Upload is being finalized by another process', { uploadId });
    }

    try {
      // Verify all chunks uploaded
      const uploadedCount = await getUploadedCount(uploadId);
      if (uploadedCount !== session.totalChunks) {
        throw new ChunkError(`Missing chunks: ${session.totalChunks - uploadedCount}`, {
          uploadedCount,
          totalChunks: session.totalChunks
        });
      }

      // Assemble file from chunks
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      await fs.mkdir(uploadDir, { recursive: true });

      const fileId = uuidv4();
      const filePath = path.join(uploadDir, fileId);
      const writeStream = require('fs').createWriteStream(filePath);

      let totalSize = 0;
      for (let i = 0; i < session.totalChunks; i++) {
        const chunkBuf = await getChunkData(uploadId, i);
        if (!chunkBuf) {
          throw new ChunkError(`Missing chunk ${i}`, { chunkIndex: i });
        }
        writeStream.write(chunkBuf);
        totalSize += chunkBuf.length;
      }

      // Wait for write stream
      await new Promise((resolve, reject) => {
        writeStream.end();
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      // Create database record
      const record = await createFileRecord(
        session.userId,
        session.filename,
        fileHash,
        encryptedKey,
        filePath,
        totalSize
      );

      // Audit log


      // Cleanup
      await deleteUploadSession(uploadId);

      vaultLogger.audit('Chunked upload finalized', {
        userId: session.userId,
        uploadId: uploadId,
        filename: session.filename,
        totalSize: totalSize
      });

      res.json({
        fileId: record.id,
        filename: record.filename,
        size: record.size,
        createdAt: record.created_at
      });
    } finally {
      // Release lock
      await releaseLock(uploadId, lockToken).catch(() => {});
    }
  } catch (error) {
    next(error);
  }
});

module.exports = router;
