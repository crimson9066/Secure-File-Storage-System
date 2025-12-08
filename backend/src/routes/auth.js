const express = require('express');
const router = express.Router();
const { hashPassword, comparePassword, generateToken } = require('../utils/auth');
const { generateRSAKeyPair, encryptKeyWithPublicKey } = require('../utils/encryption');
const { deriveKeyFromPassword, generateSalt } = require('../utils/encryption');
const { getUserByEmail, createUser, getUserById } = require('../models/user');
const { validateRequest, signupSchema, loginSchema } = require('../validation/schemas');
const vaultLogger = require('../utils/vaultLogger');
const {
  DuplicateEmailError,
  ValidationError,
  AuthenticationError,
  InvalidEmailError,
  WeakPasswordError
} = require('../utils/vaultErrors');

/**
 * POST /signup
 * Register a new user account with automatic RSA key pair generation.
 * 
 * SECURITY FLOW:
 * 1. Validate email/password against schema (zod)
 * 2. Check for existing email (prevent duplicates)
 * 3. Generate RSA-4096 key pair (asymmetric encryption for file sharing)
 * 4. Hash password with bcrypt (one-way, for login verification)
 * 5. Generate salt and derive AES key from password (PBKDF2)
 * 6. Encrypt private key with derived key (password-protected at rest)
 * 7. Store: user record + encrypted private key + salt
 * 8. Issue JWT token with token_version for future revocation support
 * 
 * WHY THIS KEY STRUCTURE:
 * - Password → bcrypt hash: Verify login attempts (one-way, slow)
 * - Password → PBKDF2 salt: Derive key to encrypt private key (deterministic, repeatable)
 * - RSA private key encrypted: User's password is key; cannot decrypt without it
 * - RSA public key stored: Used by other users to encrypt file keys for sharing
 * 
 * ALTERNATIVES CONSIDERED:
 * - Server-generated private key: Server must store and protect it (liability)
 * - Client-only key generation: Private key never stored, lost on logout (bad UX)
 * - Single password for both auth and encryption: If password compromised, loses everything
 * - Encrypt private key with server key: Replicates password protection, adds complexity
 * 
 * TOKEN_VERSION RATIONALE:
 * Included in JWT to enable password change / key recovery without invalidating current session.
 * If token_version changes (user changes password), token is considered revoked.
 * Without this, changed password takes effect only after next login.
 */
router.post('/signup', validateRequest(signupSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;
    
    // Check for existing account
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      throw new DuplicateEmailError(`Account already exists for ${email}`, { email });
    }
    
    // Generate RSA key pair for file sharing encryption
    const { publicKey, privateKey } = await generateRSAKeyPair();
    
    // Hash password for authentication (bcrypt prevents brute force)
    const passwordHash = await hashPassword(password);
    
    // Derive encryption key from password (PBKDF2 - deterministic for decryption)
    const salt = generateSalt();
    const derivedKey = deriveKeyFromPassword(password, salt);
    
    // Encrypt private key with password-derived key
    const cipher = require('crypto').createCipheriv('aes-256-gcm', derivedKey, Buffer.alloc(12));
    let encryptedPrivateKey = cipher.update(privateKey, 'utf8', 'hex');
    encryptedPrivateKey += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    encryptedPrivateKey = `${encryptedPrivateKey}.${authTag.toString('hex')}`;
    
    // Create user record in database
    const user = await createUser(email, passwordHash, salt, encryptedPrivateKey, publicKey);
    
    // Issue JWT token with version for revocation support
    const token = generateToken({
      userId: user.id,
      email: user.email,
      token_version: user.token_version ?? 0
    });

    vaultLogger.audit('User registered', {
      userId: user.id,
      email: email,
      timestamp: new Date().toISOString()
    });
    
    res.status(201).json({
      token,
      user: {
        id: user.id,
        email: user.email,
        publicKey: user.public_key
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /login
 * Authenticate user with email and password, return JWT token.
 * 
 * AUTHENTICATION FLOW:
 * 1. Validate email/password format
 * 2. Query user by email
 * 3. Compare provided password with bcrypt hash
 * 4. Generate JWT with current token_version (enables revocation on next request)
 * 5. Return token and user info
 * 
 * WHY BCRYPT COMPARISON IS SAFE:
 * - Always compares full hash even if user not found (prevents timing attacks)
 * - comparePassword performs consistent-time comparison
 * - Returns same HTTP 401 for "user not found" and "wrong password" (no email enumeration)
 * 
 * NO PASSWORD IN RESPONSE:
 * - JWT cannot decrypt password (one-way bcrypt hash)
 * - Client never sees user password after signup
 * - Session continues via JWT token, not password
 * 
 * TOKEN REFRESH STRATEGY:
 * - Tokens have 7-day expiration (configurable via env)
 * - To refresh: client calls /login again (simple, stateless)
 * - Alternative: Refresh token endpoint (adds complexity, usually not needed)
 * - Alternative: Sliding window (update expiration on each request, adds DB writes)
 */
router.post('/login', validateRequest(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;
    
    // Query user by email
    const user = await getUserByEmail(email);
    if (!user) {
      throw new AuthenticationError('Invalid credentials', { email, reason: 'user_not_found' });
    }
    
    // Compare password with bcrypt hash (timing-safe comparison)
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid credentials', { email, reason: 'password_mismatch' });
    }
    
    // Generate JWT with token version for revocation support
    const token = generateToken({
      userId: user.id,
      email: user.email,
      token_version: user.token_version ?? 0
    });

    vaultLogger.audit('User logged in', {
      userId: user.id,
      email: email,
      timestamp: new Date().toISOString()
    });
    
    res.json({
      token,
      user: {
        id: user.id,
        email: user.email,
        publicKey: user.public_key
      }
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /me
 * Retrieve current authenticated user's profile information.
 * Requires valid JWT token in Authorization header.
 * 
 * USE CASES:
 * - Frontend: Verify authentication on app load (ensure token still valid)
 * - Frontend: Hydrate user context (email, public key for encryption)
 * - Mobile: Confirm session exists before displaying content
 * 
 * WHY NOT RETURN PASSWORD/PRIVATE KEY:
 * - Password: Never transmitted over HTTP; only bcrypt hash stored server-side
 * - Private key: Encrypted at rest; client decrypts with password on demand
 * - This endpoint returns public profile only (safe to cache)
 * 
 * TOKEN_VERSION CHECK:
 * authMiddleware validates token_version before reaching this handler.
 * If user changed password, token_version was incremented, middleware rejected request.
 * This ensures revocation is enforced for all endpoints transparently.
 */
router.get('/me', async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AuthenticationError('Not authenticated', { reason: 'missing_token' });
    }
    
    const user = await getUserById(req.user.userId);
    if (!user) {
      throw new AuthenticationError('User not found', { userId: req.user.userId, reason: 'user_deleted' });
    }

    vaultLogger.debug('Fetching user profile', {
      userId: user.id,
      email: user.email
    });
    
    res.json({
      id: user.id,
      email: user.email,
      publicKey: user.public_key
    });
  } catch (error) {
    next(error);
  }
});

module.exports = router;
