const { z } = require('zod');

// Auth schemas
const signupSchema = z.object({
  email: z.string().email('Invalid email').max(255),
  password: z.string()
    .min(12, 'Password must be at least 12 characters')
    .max(255)
});

const loginSchema = z.object({
  email: z.string().email('Invalid email').max(255),
  password: z.string().min(1, 'Password required')
});

// File schemas
const fileUploadSchema = z.object({
  encryptedKey: z.string().min(1, 'encryptedKey required').max(10000)
});

const shareFileSchema = z.object({
  fileId: z.string().uuid('Invalid fileId'),
  recipientEmail: z.string().email('Invalid recipient email'),
  encryptedKey: z.string().min(1, 'encryptedKey required').max(10000)
});

// Chunked upload schemas
const initChunkUploadSchema = z.object({
  filename: z.string().min(1, 'Filename required').max(255),
  totalSize: z.number().int().positive('Total size must be positive'),
  totalChunks: z.number().int().positive('Total chunks must be positive'),
  chunkSize: z.number().int().positive('Chunk size must be positive')
});

const appendChunkSchema = z.object({
  uploadId: z.string().uuid('Invalid uploadId'),
  chunkIndex: z.number().int().nonnegative('Chunk index must be non-negative'),
  chunkHash: z.string().min(64).max(64, 'Invalid chunk hash')
});

const finalizeChunkUploadSchema = z.object({
  uploadId: z.string().uuid('Invalid uploadId'),
  encryptedKey: z.string().min(1, 'encryptedKey required').max(10000),
  fileHash: z.string().min(64).max(64, 'Invalid file hash')
});

// Validation middleware factory
const validateRequest = (schema) => (req, res, next) => {
  try {
    const validated = schema.parse(req.body);
    req.validated = validated;
    next();
  } catch (error) {
    if (error.errors && error.errors.length > 0) {
      const msg = error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join('; ');
      return res.status(400).json({ error: `Validation failed: ${msg}` });
    }
    res.status(400).json({ error: 'Validation failed' });
  }
};

module.exports = {
  signupSchema,
  loginSchema,
  fileUploadSchema,
  shareFileSchema,
  initChunkUploadSchema,
  appendChunkSchema,
  finalizeChunkUploadSchema,
  validateRequest
};
