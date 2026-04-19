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
  getStorageStats,
  getUserById,
  getUserByEmail
} = require('../models/user');
const vaultLogger = require('../utils/vaultLogger');
const {
  FileNotFoundError,
  FileAccessDeniedError,
  ValidationError,
  StorageError
} = require('../utils/vaultErrors');


const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE || 104857600)
  }
});

router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    const { encryptedKey } = req.body;
    
    if (!req.file || !encryptedKey) {
      throw new ValidationError('File and encryptedKey required', { missingFields: !req.file ? ['file'] : ['encryptedKey'] });
    }



    const fileHash = hashFile(req.file.buffer);

    const existing = await getFileByHash(fileHash);

    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    await fs.mkdir(uploadDir, { recursive: true });

    let filePath;
    if (existing) {
      // Reuse existing physical file (deduplication)
      vaultLogger.info('File deduplicated', {
        userId: req.user.userId,
        fileHash: fileHash.substring(0, 8),
        filename: req.file.originalname
      });
      filePath = existing.file_path;
    } else {
      // Store new physical file
      const fileId = uuidv4();
      filePath = path.join(uploadDir, fileId);
      await fs.writeFile(filePath, req.file.buffer);
    }

    const record = await createFileRecord(
      req.user.userId,
      req.file.originalname,
      fileHash,
      encryptedKey,
      filePath,
      req.file.size
    );



    vaultLogger.audit('File uploaded', {
      userId: req.user.userId,
      fileId: record.id,
      filename: req.file.originalname,
      size: req.file.size
    });

    res.status(201).json({
      fileId: record.id,
      filename: record.filename,
      hash: record.file_hash,
      size: record.size,
      createdAt: record.created_at,
      deduplicated: !!existing
    });
  } catch (error) {
    next(error);
  }
});

router.get('/list', async (req, res, next) => {
  try {
    const files = await getFilesByOwner(req.user.userId);
    const sharedFiles = await getSharedFilesForUser(req.user.userId);
    const stats = await getStorageStats(req.user.userId);
    
    vaultLogger.debug('Files listed', {
      userId: req.user.userId,
      ownFileCount: files.length,
      sharedFileCount: sharedFiles.length
    });
    
    res.json({
      ownFiles: files,
      sharedFiles: sharedFiles,
      stats: {
        fileCount: parseInt(stats.file_count),
        totalSize: parseInt(stats.total_size)
      }
    });
  } catch (error) {
    next(error);
  }
});

router.get('/download/:fileId', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const file = await getFileById(fileId);
    
    if (!file) {
      throw new FileNotFoundError(`File not found: ${fileId}`, { fileId });
    }
    
    if (file.owner_id !== req.user.userId) {
      const sharedFile = await getSharedFilesForUser(req.user.userId);
      const hasAccess = sharedFile.some(sf => sf.id === fileId);
      
      if (!hasAccess) {
        throw new FileAccessDeniedError('You do not have permission to access this file', { fileId });
      }
    }
    
    const encryptedData = await fs.readFile(file.file_path);
    
    // Audit log

    
    vaultLogger.audit('File downloaded', {
      userId: req.user.userId,
      fileId: fileId,
      filename: file.filename,
      size: file.size
    });
    
    res.json({
      fileId: file.id,
      filename: file.filename,
      fileHash: file.file_hash,
      size: file.size,
      encryptedData: encryptedData.toString('base64'),
      encryptedKey: file.encrypted_key
    });
  } catch (error) {
    next(error);
  }
});

router.delete('/delete/:fileId', async (req, res, next) => {
  try {
    const { fileId } = req.params;
    const file = await getFileById(fileId);
    
    if (!file) {
      throw new FileNotFoundError(`File not found: ${fileId}`, { fileId });
    }
    
    // Check ownership (users can only delete their own files)
    if (file.owner_id !== req.user.userId) {
      throw new FileAccessDeniedError('You can only delete your own files', { fileId, ownerId: file.owner_id });
    }

    await deleteFile(fileId);

    // Audit log


    vaultLogger.audit('File deleted', {
      userId: req.user.userId,
      fileId: fileId,
      filename: file.filename
    });

    res.json({ success: true, softDeleted: true });
  } catch (error) {
    next(error);
  }
});

router.post('/share', async (req, res, next) => {
  try {
    const { fileId, recipientEmail, encryptedKey } = req.body;
    
    if (!fileId || !recipientEmail || !encryptedKey) {
      throw new ValidationError('Missing required fields', { required: ['fileId', 'recipientEmail', 'encryptedKey'] });
    }
    
    // Get file
    const file = await getFileById(fileId);
    if (!file) {
      throw new FileNotFoundError(`File not found: ${fileId}`, { fileId });
    }
    
    // Check ownership
    if (file.owner_id !== req.user.userId) {
      throw new FileAccessDeniedError('You can only share your own files', { fileId, ownerId: file.owner_id });
    }
    
    // Get recipient user
    const recipientUser = await getUserByEmail(recipientEmail);
    if (!recipientUser) {
      throw new FileNotFoundError(`Recipient user not found: ${recipientEmail}`, { recipientEmail });
    }
    
    const share = await shareFile(fileId, req.user.userId, recipientUser.id, encryptedKey);
    
    // Audit log

    
    vaultLogger.audit('File shared', {
      userId: req.user.userId,
      fileId: fileId,
      recipientEmail: recipientEmail
    });
    
    res.status(201).json({
      shareId: share.id,
      fileId: fileId,
      recipientEmail: recipientEmail
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
