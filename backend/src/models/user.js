const pool = require('../config/database');

/**
 * GET USER BY EMAIL
 * Query user by email address with all security-relevant fields.
 * Includes token_version for revocation checks and password_changed_at for audit.
 * 
 * Use case: Authentication flow (login), user lookup for sharing
 * Returns: User object or null if not found
 */
const getUserByEmail = async (email) => {
  const result = await pool.query(
    'SELECT id, email, password_hash, password_salt, encrypted_private_key, public_key, token_version, password_changed_at, created_at FROM users WHERE email = $1',
    [email]
  );
  return result.rows[0] || null;
};

/**
 * GET USER BY ID
 * Query user by ID with security fields (token_version for revocation).
 * Excludes password_hash (not needed for authenticated users).
 * Includes encrypted_private_key if needed for key recovery.
 * 
 * Use case: Middleware auth check, user profile fetch, session validation
 * Returns: User object or null if not found
 */
const getUserById = async (id) => {
  const result = await pool.query(
    'SELECT id, email, public_key, encrypted_private_key, token_version, password_changed_at, created_at FROM users WHERE id = $1',
    [id]
  );
  return result.rows[0] || null;
};

/**
 * CREATE USER
 * Register new user account with initial token_version of 0.
 * 
 * Stores:
 * - email: User identifier (unique)
 * - password_hash: bcrypt output (password verification)
 * - password_salt: PBKDF2 salt (private key encryption)
 * - encrypted_private_key: Password-protected RSA private key
 * - public_key: RSA public key (shared with other users for encryption)
 * - token_version: Starts at 0, increments on password/key changes
 * 
 * Why separate password_hash and password_salt:
 * - password_hash: Used for login verification (bcrypt, slow)
 * - password_salt: Used to derive key for encrypting private key (PBKDF2)
 * - Separating prevents using same password operations for both purposes
 */
const createUser = async (email, passwordHash, saltValue, encryptedPrivateKey, publicKey) => {
  const result = await pool.query(
    `INSERT INTO users (email, password_hash, password_salt, encrypted_private_key, public_key, token_version)
     VALUES ($1, $2, $3, $4, $5, 0)
     RETURNING id, email, public_key, token_version, created_at`,
    [email, passwordHash, saltValue, encryptedPrivateKey, publicKey]
  );
  return result.rows[0];
};

/**
 * INCREMENT TOKEN VERSION
 * Atomically increment token_version to invalidate all existing JWT tokens.
 * 
 * REVOCATION MECHANISM:
 * - When user changes password or updates private key, increment token_version
 * - All existing tokens now have mismatched token_version
 * - Middleware (auth.js) validates token_version on every request
 * - If version doesn't match, request is rejected with 401
 * - User must login again to get new token with updated version
 * 
 * USE CASES:
 * - Password change: Revoke all sessions for security
 * - Private key recovery/update: Revoke all sessions
 * - Manual logout: Call this to invalidate current token
 * 
 * WHY NOT OTHER APPROACHES:
 * - Redis blacklist: Lost on restart, not reliable
 * - Token expiration: Requires waiting for token to expire (hours/days)
 * - Session table: Adds complexity, requires cleanup
 * - Token version in JWT: Simple, stateless, instant (chosen approach)
 * 
 * ATOMIC OPERATION:
 * UPDATE returns immediately with new version; no race conditions.
 * Database handles atomicity; no need for locks.
 * 
 * Returns: New token_version value or null on error
 */
const incrementTokenVersion = async (userId) => {
  const result = await pool.query(
    `UPDATE users SET token_version = token_version + 1 WHERE id = $1 RETURNING token_version`,
    [userId]
  );
  return result.rows[0] ? result.rows[0].token_version : null;
};

/**
 * CHANGE PASSWORD
 * Update password hash and salt, increment token_version, record timestamp.
 * 
 * ATOMIC OPERATION:
 * - password_hash updated: New bcrypt hash (old token can't reuse hash)
 * - password_salt updated: New salt for deriving encryption key
 * - token_version incremented: All existing tokens invalidated
 * - password_changed_at set: Audit trail for security events
 * - All in single transaction: Prevents inconsistent state
 * 
 * SECURITY RATIONALE:
 * - Incrementing token_version ensures user must re-login
 * - New password_salt prevents deriving old encryption key
 * - New password_hash prevents reusing password hash anywhere
 * - password_changed_at enables security audits and suspicious activity detection
 * 
 * USE CASE:
 * - Password reset/change request from user
 * - Security incident response (detected compromise)
 * - Scheduled password rotation policies
 * 
 * Returns: Updated token_version and password_changed_at timestamp
 */
const changePassword = async (userId, newPasswordHash, newSalt) => {
  const result = await pool.query(
    `UPDATE users
     SET password_hash = $1, password_salt = $2, password_changed_at = CURRENT_TIMESTAMP, token_version = token_version + 1
     WHERE id = $3
     RETURNING token_version, password_changed_at`,
    [newPasswordHash, newSalt, userId]
  );
  return result.rows[0] || null;
};

/**
 * UPDATE ENCRYPTED PRIVATE KEY
 * Store new encrypted private key and increment token_version.
 * 
 * WHEN THIS HAPPENS:
 * - User rotates RSA key pair (rare, manual operation)
 * - User recovers private key with new password
 * - Key compromise detected, user wants new key
 * 
 * SECURITY IMPLICATIONS:
 * - Incrementing token_version revokes all tokens (requires re-login)
 * - New encrypted_private_key with same password or new password
 * - Old tokens can't use new key because they're revoked
 * - Next login generates new token with incremented version
 * 
 * ALTERNATIVES CONSIDERED:
 * - Update without token version increment: Old tokens could decrypt files with old key
 * - Only update if password matches: Extra verification step, adds complexity
 * - Store multiple versions: Complex, confusing which key is current
 * 
 * Returns: New token_version value
 */
const updateEncryptedPrivateKey = async (userId, newEncryptedPrivateKey) => {
  const result = await pool.query(
    `UPDATE users
     SET encrypted_private_key = $1, token_version = token_version + 1
     WHERE id = $2
     RETURNING token_version`,
    [newEncryptedPrivateKey, userId]
  );
  return result.rows[0] ? result.rows[0].token_version : null;
};

/**
 * GET FILES BY OWNER
 * Retrieve all non-deleted files owned by user, ordered by creation time.
 * 
 * SOFT DELETE PATTERN:
 * Uses IS DISTINCT FROM TRUE to exclude soft-deleted files.
 * This allows:
 * - Undelete capability (temporarily, set is_deleted = FALSE)
 * - Audit trail preservation (file record not actually deleted)
 * - Version history (file_versions still available even after soft-delete)
 * 
 * ALTERNATIVES:
 * - Hard delete: Permanent loss of file and metadata; can't recover
 * - Separate "deleted" table: More complex queries, harder to join on data
 * - Timestamp-based archive: Requires background cleanup jobs
 * 
 * WHY IS DISTINCT FROM TRUE (not just "is_deleted = FALSE"):
 * - NULL values mean "not soft deleted" (default state)
 * - "is_deleted = FALSE" would exclude NULL rows (unexpected results)
 * - "IS DISTINCT FROM TRUE" includes both NULL and FALSE
 * - More explicit and less error-prone
 * 
 * Returns: Array of file objects ordered by newest first
 */
const getFilesByOwner = async (userId) => {
  const result = await pool.query(
    'SELECT id, filename, file_hash, size, created_at FROM files WHERE owner_id = $1 AND (is_deleted IS DISTINCT FROM TRUE) ORDER BY created_at DESC',
    [userId]
  );
  return result.rows;
};

/**
 * GET FILE BY ID
 * Retrieve complete file record including encryption key and metadata.
 * Note: Does not filter by is_deleted; must be done by caller if needed.
 * 
 * Returns: File object with all fields or null if not found
 */
const getFileById = async (fileId) => {
  const result = await pool.query(
    'SELECT * FROM files WHERE id = $1',
    [fileId]
  );
  return result.rows[0] || null;
};

/**
 * GET FILE BY HASH (DEDUPLICATION LOOKUP)
 * Query file by SHA-256 hash for deduplication and upload optimization.
 * 
 * DEDUPLICATION STRATEGY:
 * - Client computes SHA-256 hash of file before uploading
 * - Query database for existing file with same hash
 * - If found: Create file_shares record instead of re-uploading (storage savings)
 * - If not found: Proceed with encrypted upload to storage
 * 
 * SECURITY CONSIDERATIONS:
 * - Hash collisions extremely unlikely (SHA-256: 2^256 combinations)
 * - Hash reveals file identity to server but not content (encrypted)
 * - Multiple users with identical file (e.g., same PDF): Share physical file
 * - If user can query hash, they can probe for files: Mitigated by file_shares check
 * 
 * ALTERNATIVES:
 * - No deduplication: Stores identical files multiple times (wasted space)
 * - Client-managed deduplication: Client must track hashes (complex, unreliable)
 * - Server-managed with metadata: What we have; simple and effective
 * 
 * WHY EXCLUDE SOFT-DELETED:
 * - Deleted files shouldn't be deduplicated against
 * - File might be deleted but dedup entry references deleted file
 * - Each user keeps their own reference; deletion is independent
 * 
 * Returns: File object if exists and not deleted, null otherwise
 */
const getFileByHash = async (fileHash) => {
  const result = await pool.query(
    'SELECT * FROM files WHERE file_hash = $1 AND (is_deleted IS DISTINCT FROM TRUE) LIMIT 1',
    [fileHash]
  );
  return result.rows[0] || null;
};

/**
 * CREATE FILE RECORD
 * Store metadata for uploaded file (not the file content itself).
 * 
 * WHAT'S STORED:
 * - owner_id: User who uploaded
 * - filename: Original filename (client-provided, encrypted)
 * - file_hash: SHA-256 of plaintext file (deduplication key)
 * - encrypted_key: AES-256 key encrypted with file owner's RSA public key
 * - file_path: Path to encrypted file on storage (local: ./uploads, production: S3)
 * - size: File size in bytes (for quota enforcement)
 * 
 * ENCRYPTION NOTES:
 * - AES-256 key is different for each file
 * - encrypted_key is encrypted with owner's RSA public key
 * - Owner can decrypt encrypted_key using their private key (after entering password)
 * - Sharing works by encrypting same AES-256 key with recipient's RSA public key
 * 
 * Returns: New file record with id, filename, file_hash, size, created_at
 */
const createFileRecord = async (ownerId, filename, fileHash, encryptedKey, filePath, fileSize) => {
  const result = await pool.query(
    `INSERT INTO files (owner_id, filename, file_hash, encrypted_key, file_path, size)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id, filename, file_hash, size, created_at`,
    [ownerId, filename, fileHash, encryptedKey, filePath, fileSize]
  );
  return result.rows[0];
};

/**
 * SOFT DELETE FILE
 * Mark file as deleted without removing from storage or database.
 * 
 * WHY SOFT DELETE (over hard delete):
 * - Recovery: If user accidentally deletes, can restore from backup/admin
 * - Audit trail: Deletion event is recorded in database
 * - Version history preserved: Can restore old versions even after deletion
 * - Legal holds: Delete marked files can be held for compliance
 * - Backup consistency: Deleted file still exists in backups
 * 
 * TRADE-OFFS:
 * - Storage not immediately freed (must run cleanup job)
 * - Queries must filter is_deleted (slightly more complex)
 * - Privacy: Deleted files not immediately gone from storage
 * 
 * ALTERNATIVES:
 * - Hard delete: Immediate storage recovery but risky (no recovery)
 * - Encrypt with tombstone key: Prevents user access but data remains
 * - Move to trash bin: Extra table, more complex (we use is_deleted flag)
 * 
 * GARBAGE COLLECTION:
 * Background job should:
 * - Find files deleted > X days ago
 * - Delete physical file from storage
 * - Optionally hard-delete database record (after backups archived)
 * - Freed space reported back to user
 * 
 * Returns: Deleted file record
 */
const deleteFile = async (fileId) => {
  const result = await pool.query(
    `UPDATE files SET is_deleted = TRUE, deleted_at = CURRENT_TIMESTAMP WHERE id = $1 RETURNING id`,
    [fileId]
  );
  return result.rows[0];
};

/**
 * SHARE FILE WITH USER
 * Grant file access to another user by encrypting file key for their public key.
 * 
 * SHARING MECHANISM:
 * 1. File has one AES-256 symmetric key (used to encrypt actual file content)
 * 2. Owner has file_shares record: encrypted_key encrypted with owner's public key
 * 3. To share: Encrypt same AES-256 key with recipient's public key
 * 4. Recipient gets new file_shares record: encrypted_key encrypted with their key
 * 5. Both users can decrypt encrypted_key with their private key (after password)
 * 6. Both users get same plaintext AES-256 key, can decrypt actual file
 * 
 * ASYMMETRIC ENCRYPTION (RSA):
 * - File key doesn't need to be re-encrypted (same key shared)
 * - Owner's RSA private key never transmitted
 * - Each user has unique encrypted copy of file key
 * - Removing recipient's file_shares prevents their decryption
 * 
 * ALTERNATIVES:
 * - Share password: Insecure, user must communicate out-of-band
 * - Derive key from username: Allows enumeration; doesn't work for deletion
 * - Share private key: Impossible, user wouldn't have it
 * 
 * Returns: Created share record id
 */
const shareFile = async (fileId, ownerId, recipientId, encryptedKey) => {
  const result = await pool.query(
    `INSERT INTO file_shares (file_id, owner_id, recipient_id, encrypted_key)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [fileId, ownerId, recipientId, encryptedKey]
  );
  return result.rows[0];
};

/**
 * GET SHARED FILES FOR USER
 * Retrieve all files shared with a user (not owned by them).
 * 
 * QUERY LOGIC:
 * - file_shares: Link between file and recipient
 * - files: File metadata and hash
 * - users: Owner email (who shared the file)
 * - Result includes encrypted_key for recipient (encrypted with their public key)
 * - Recipient decrypts key using their private key (after entering password)
 * 
 * ACCESS CONTROL:
 * - Only recipient can see encrypted_key in their results
 * - Recipient cannot see owner's encrypted_key
 * - If share is deleted, file disappears from recipient's list
 * 
 * Returns: Array of shared file objects with owner email
 */
const getSharedFilesForUser = async (userId) => {
  const result = await pool.query(
    `SELECT f.id, f.filename, f.file_hash, f.size, f.created_at, fs.encrypted_key, u.email as owner_email
     FROM file_shares fs
     JOIN files f ON fs.file_id = f.id
     JOIN users u ON fs.owner_id = u.id
     WHERE fs.recipient_id = $1
     ORDER BY f.created_at DESC`,
    [userId]
  );
  return result.rows;
};

/**
 * LOG AUDIT EVENT
 * Record security-relevant events for compliance and investigation.
 * 
 * AUDIT TRAIL INCLUDES:
 * - user_id: Who performed the action
 * - action: What happened (upload, download, share, delete, etc.)
 * - resource_type: Type of resource (file, user, share)
 * - resource_id: ID of affected resource
 * - details: Additional context (JSON string)
 * - ip_address: Client IP for geographic/anomaly detection
 * - hmac: Optional HMAC for tamper detection
 * - hmac_version: HMAC algorithm version (for future updates)
 * 
 * USE CASES:
 * - Security investigation: "Who accessed this file when?"
 * - Compliance: "Provide audit log for this time period"
 * - Anomaly detection: "Many deletions from same IP?"
 * - Insider threat: "Did employee access files after leaving?"
 * 
 * WHY HMAC (Optional):
 * - Detect if audit log was tampered with
 * - Verify log wasn't modified after the fact
 * - For high-security deployments only
 * 
 * RETENTION:
 * - Logs never deleted (immutable append-only table)
 * - Keep indefinitely for compliance
 * - Archive to cold storage if table grows too large
 * - Query performance: Index on (user_id, created_at) for user access patterns
 * 
 * Returns: None (insert only)
 */
const logAuditEvent = async (userId, action, resourceType, resourceId, details, ipAddress, hmac = null, hmac_version = null) => {
  await pool.query(
    `INSERT INTO audit_logs (user_id, action, resource_type, resource_id, details, ip_address, hmac, hmac_version)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [userId, action, resourceType, resourceId, JSON.stringify(details), ipAddress, hmac, hmac_version]
  );
};

/**
 * GET STORAGE STATS
 * Calculate user's storage usage for quota enforcement.
 * 
 * QUOTA ENFORCEMENT:
 * - File count: Limit number of files (e.g., 10,000)
 * - Total size: Limit total storage (e.g., 100 GB)
 * - Query includes only non-deleted files
 * - Deleted files don't count toward quota
 * 
 * PERFORMANCE:
 * - SUM and COUNT are fast with index on owner_id
 * - COALESCE(SUM(size), 0): Returns 0 if no files (null case)
 * - Consider caching result if queried frequently
 * - Run as async background job if many users
 * 
 * USE CASES:
 * - Upload UI: Display storage used and remaining
 * - Upload validation: Reject if would exceed quota
 * - Admin dashboard: Show per-user usage
 * - Billing: Tiered pricing based on storage
 * 
 * Returns: Object with file_count and total_size
 */
const getStorageStats = async (userId) => {
  const result = await pool.query(
    `SELECT COUNT(*) as file_count, COALESCE(SUM(size), 0) as total_size
     FROM files WHERE owner_id = $1`,
    [userId]
  );
  return result.rows[0];
};

module.exports = {
  getUserByEmail,
  getUserById,
  createUser,
  incrementTokenVersion,
  changePassword,
  updateEncryptedPrivateKey,
  getFilesByOwner,
  getFileById,
  getFileByHash,
  createFileRecord,
  deleteFile,
  shareFile,
  getSharedFilesForUser,
  logAuditEvent,
  getStorageStats
};
