const express = require('express');
const router = express.Router();
const multer = require('multer');
const fs = require('fs').promises;
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { encryptFile, decryptFile, hashFile, encryptKeyWithPublicKey, decryptKeyWithPrivateKey } = require('../utils/encryption');
const { deriveKeyFromPassword } = require('../utils/encryption');
const { 
  getFilesByOwner, 
  getFileById, 
  getFileByHash,
  createFileRecord, 
  deleteFile, 
  shareFile, 
  getSharedFilesForUser, 
  logAuditEvent,
  getStorageStats,
  getUserById,
  getUserByEmail
} = require('../models/user');
const { authMiddleware } = require('../middleware/auth');
const { validateRequest, fileUploadSchema, shareFileSchema } = require('../validation/schemas');
const logger = require('../utils/logger');

// Configure multer
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || 104857600)
  }
});

// Upload file with deduplication
router.post('/upload', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const { encryptedKey } = req.body;
    
    if (!req.file || !encryptedKey) {
      return res.status(400).json({ error: 'File and encryptedKey required' });
    }

    // Compute file hash for deduplication
    const fileHash = hashFile(req.file.buffer);

    // Check for existing identical file
    const existing = await getFileByHash(fileHash);

    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    await fs.mkdir(uploadDir, { recursive: true });

    let filePath;
    if (existing) {
      // Deduplicate: reuse existing physical file
      logger.info('Deduplication hit for user %s file hash %s', req.user.userId, fileHash);
      filePath = existing.file_path;
    } else {
      // New physical file
      const fileId = uuidv4();
      filePath = path.join(uploadDir, fileId);
      await fs.writeFile(filePath, req.file.buffer);
    }

    // Create database record pointing to filePath
    const record = await createFileRecord(
      req.user.userId,
      req.file.originalname,
      fileHash,
      encryptedKey,
      filePath,
      req.file.size
    );

    // Log audit event
    await logAuditEvent(req.user.userId, 'FILE_UPLOAD', 'FILE', record.id, {
      filename: req.file.originalname,
      size: req.file.size,
      deduplicated: !!existing
    }, req.ip);

    res.status(201).json({
      fileId: record.id,
      filename: record.filename,
      hash: record.file_hash,
      size: record.size,
      createdAt: record.created_at,
      deduplicated: !!existing
    });
  } catch (error) {
    logger.error('Upload error: %o', { error: error.message, stack: error.stack });
    res.status(500).json({ error: 'Upload failed' });
  }
});

// List user's files
router.get('/list', authMiddleware, async (req, res) => {
  try {
    const files = await getFilesByOwner(req.user.userId);
    const sharedFiles = await getSharedFilesForUser(req.user.userId);
    const stats = await getStorageStats(req.user.userId);
    
    res.json({
      ownFiles: files,
      sharedFiles: sharedFiles,
      stats: {
        fileCount: parseInt(stats.file_count),
        totalSize: parseInt(stats.total_size)
      }
    });
  } catch (error) {
    logger.error('List files error: %o', { message: error.message });
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Download file
router.get('/download/:fileId', authMiddleware, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await getFileById(fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check access (owner or shared)
    if (file.owner_id !== req.user.userId) {
      // Check if file is shared
      const sharedFile = await getSharedFilesForUser(req.user.userId);
      const hasAccess = sharedFile.some(sf => sf.id === fileId);
      
      if (!hasAccess) {
        return res.status(403).json({ error: 'Access denied' });
      }
    }
    
    // Read encrypted file (streaming could be implemented here)
    const encryptedData = await fs.readFile(file.file_path);
    
    // Log audit event
    await logAuditEvent(req.user.userId, 'FILE_DOWNLOAD', 'FILE', fileId, {
      filename: file.filename
    }, req.ip);
    
    res.json({
      fileId: file.id,
      filename: file.filename,
      fileHash: file.file_hash,
      size: file.size,
      encryptedData: encryptedData.toString('base64'),
      encryptedKey: file.encrypted_key
    });
  } catch (error) {
    logger.error('Download error: %o', { message: error.message });
    res.status(500).json({ error: 'Download failed' });
  }
});

// Soft-delete file
router.delete('/delete/:fileId', authMiddleware, async (req, res) => {
  try {
    const { fileId } = req.params;
    const file = await getFileById(fileId);
    
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check ownership
    if (file.owner_id !== req.user.userId) {
      return res.status(403).json({ error: 'Can only delete own files' });
    }

    // Soft delete (mark record deleted)
    await deleteFile(fileId);

    // Log audit event
    await logAuditEvent(req.user.userId, 'FILE_DELETE', 'FILE', fileId, {
      filename: file.filename
    }, req.ip);

    res.json({ success: true, softDeleted: true });
  } catch (error) {
    logger.error('Delete error: %o', { message: error.message });
    res.status(500).json({ error: 'Delete failed' });
  }
});

// Share file with user (with validation)
router.post('/share', authMiddleware, validateRequest(shareFileSchema), async (req, res) => {
  try {
    const { fileId, recipientEmail, encryptedKey } = req.validated;
    
    // Get file
    const file = await getFileById(fileId);
    if (!file) {
      return res.status(404).json({ error: 'File not found' });
    }
    
    // Check ownership
    if (file.owner_id !== req.user.userId) {
      return res.status(403).json({ error: 'Can only share own files' });
    }
    
    // Get recipient user
    const recipientUser = await getUserByEmail(recipientEmail);
    if (!recipientUser) {
      return res.status(404).json({ error: 'Recipient user not found' });
    }
    
    // Share file
    const share = await shareFile(fileId, req.user.userId, recipientUser.id, encryptedKey);
    
    // Log audit event
    await logAuditEvent(req.user.userId, 'FILE_SHARE', 'FILE', fileId, {
      filename: file.filename,
      recipientEmail: recipientEmail
    }, req.ip);
    
    res.status(201).json({
      shareId: share.id,
      fileId: fileId,
      recipientEmail: recipientEmail
    });
  } catch (error) {
    logger.error('Share error: %o', { message: error.message });
    res.status(500).json({ error: 'Share failed' });
  }
});

module.exports = router;
