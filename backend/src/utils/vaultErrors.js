/**
 * Custom Error Classes for SecureVault
 * 
 * Provides domain-specific error types with unique error codes.
 * Makes debugging easier (ERROR_AUTH_001 vs "Authentication failed")
 * and enables proper HTTP status code mapping.
 * 
 * Usage:
 *   throw new AuthenticationError('Invalid credentials', 'AUTH_001');
 *   throw new EncryptionError('Failed to encrypt file', 'ENC_001');
 */

class VaultError extends Error {
  constructor(code, message, statusCode = 500, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.timestamp = new Date().toISOString();
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      error: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      ...(process.env.NODE_ENV === 'development' && { stack: this.stack })
    };
  }
}

// Authentication & Authorization Errors
class AuthenticationError extends VaultError {
  constructor(message, code = 'AUTH_001', details = {}) {
    super(code, message, 401, details);
  }
}

class InvalidTokenError extends VaultError {
  constructor(message = 'Token invalid or expired', details = {}) {
    super('AUTH_002', message, 401, details);
  }
}

class TokenRevocedError extends VaultError {
  constructor(message = 'Token has been revoked (password/key changed)', details = {}) {
    super('AUTH_003', message, 401, details);
  }
}

class AuthorizationError extends VaultError {
  constructor(message = 'You do not have permission to access this resource', details = {}) {
    super('AUTH_004', message, 403, details);
  }
}

// File & Upload Errors
class FileNotFoundError extends VaultError {
  constructor(fileId, details = {}) {
    super('FILE_001', `File ${fileId} not found`, 404, details);
  }
}

class FileSizeError extends VaultError {
  constructor(size, maxSize, details = {}) {
    super('FILE_002', `File size ${size} bytes exceeds limit of ${maxSize}`, 400, details);
  }
}

class FileAccessDeniedError extends VaultError {
  constructor(fileId, userId, details = {}) {
    super('FILE_003', `User ${userId} cannot access file ${fileId}`, 403, { fileId, userId, ...details });
  }
}

class UploadSessionError extends VaultError {
  constructor(message, code = 'UPLOAD_001', details = {}) {
    super(code, message, 400, details);
  }
}

class ChunkError extends VaultError {
  constructor(message, code = 'CHUNK_001', details = {}) {
    super(code, message, 400, details);
  }
}

// Encryption Errors
class EncryptionError extends VaultError {
  constructor(message, code = 'ENC_001', details = {}) {
    super(code, message, 500, details);
  }
}

class DecryptionError extends VaultError {
  constructor(message, code = 'ENC_002', details = {}) {
    super(code, message, 500, details);
  }
}

class KeyGenerationError extends VaultError {
  constructor(message, code = 'KEY_001', details = {}) {
    super(code, message, 500, details);
  }
}

// Database Errors
class DatabaseError extends VaultError {
  constructor(message, code = 'DB_001', details = {}) {
    super(code, message, 500, details);
  }
}

class DuplicateEmailError extends VaultError {
  constructor(email, details = {}) {
    super('DB_002', `Email ${email} already registered`, 409, { email, ...details });
  }
}

// Input Validation Errors
class ValidationError extends VaultError {
  constructor(message, code = 'VAL_001', details = {}) {
    super(code, message, 400, details);
  }
}

class InvalidEmailError extends VaultError {
  constructor(email, details = {}) {
    super('VAL_002', `Email ${email} is invalid`, 400, { email, ...details });
  }
}

class WeakPasswordError extends VaultError {
  constructor(requirements = '', details = {}) {
    super('VAL_003', `Password too weak. ${requirements}`, 400, details);
  }
}

// Rate Limiting Errors
class RateLimitError extends VaultError {
  constructor(retryAfter = 900, details = {}) {
    super('RATE_001', `Too many requests. Try again in ${retryAfter} seconds`, 429, details);
  }
}

// Sharing Errors
class ShareError extends VaultError {
  constructor(message, code = 'SHARE_001', details = {}) {
    super(code, message, 400, details);
  }
}

class UserNotFoundError extends VaultError {
  constructor(email, details = {}) {
    super('USER_001', `User with email ${email} not found`, 404, { email, ...details });
  }
}

// Storage Errors
class StorageError extends VaultError {
  constructor(message, code = 'STORAGE_001', details = {}) {
    super(code, message, 500, details);
  }
}

// Redis/Session Errors
class SessionError extends VaultError {
  constructor(message, code = 'SESSION_001', details = {}) {
    super(code, message, 500, details);
  }
}

module.exports = {
  VaultError,
  // Auth
  AuthenticationError,
  InvalidTokenError,
  TokenRevocedError,
  AuthorizationError,
  // Files
  FileNotFoundError,
  FileSizeError,
  FileAccessDeniedError,
  UploadSessionError,
  ChunkError,
  // Encryption
  EncryptionError,
  DecryptionError,
  KeyGenerationError,
  // Database
  DatabaseError,
  DuplicateEmailError,
  // Validation
  ValidationError,
  InvalidEmailError,
  WeakPasswordError,
  // Rate Limiting
  RateLimitError,
  // Sharing
  ShareError,
  UserNotFoundError,
  // Storage
  StorageError,
  // Sessions
  SessionError
};
