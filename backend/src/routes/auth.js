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

router.post('/signup', validateRequest(signupSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;
    
    const existingUser = await getUserByEmail(email);
    if (existingUser) {
      throw new DuplicateEmailError(`Account already exists for ${email}`, { email });
    }
    
    const { publicKey, privateKey } = await generateRSAKeyPair();
    
    const passwordHash = await hashPassword(password);
    
    const salt = generateSalt();
    const derivedKey = deriveKeyFromPassword(password, salt);
    
    const cipher = require('crypto').createCipheriv('aes-256-gcm', derivedKey, Buffer.alloc(12));
    let encryptedPrivateKey = cipher.update(privateKey, 'utf8', 'hex');
    encryptedPrivateKey += cipher.final('hex');
    const authTag = cipher.getAuthTag();
    encryptedPrivateKey = `${encryptedPrivateKey}.${authTag.toString('hex')}`;
    
    const user = await createUser(email, passwordHash, salt, encryptedPrivateKey, publicKey);
    
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

router.post('/login', validateRequest(loginSchema), async (req, res, next) => {
  try {
    const { email, password } = req.validated;
    
    const user = await getUserByEmail(email);
    if (!user) {
      throw new AuthenticationError('Invalid credentials', { email, reason: 'user_not_found' });
    }
    
    const isPasswordValid = await comparePassword(password, user.password_hash);
    if (!isPasswordValid) {
      throw new AuthenticationError('Invalid credentials', { email, reason: 'password_mismatch' });
    }
    
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
