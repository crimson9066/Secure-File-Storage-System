const { verifyToken } = require('../utils/auth');
const { getUserById } = require('../models/user');
const vaultLogger = require('../utils/vaultLogger');
const { InvalidTokenError, AuthenticationError } = require('../utils/vaultErrors');

const authMiddleware = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new InvalidTokenError('No token provided', { reason: 'missing_header' });
    }

    // Extract token from "Bearer <token>" format
    const token = authHeader.slice(7);
    const decoded = verifyToken(token);

    if (!decoded) {
      throw new InvalidTokenError('Token invalid or expired', { reason: 'verification_failed' });
    }

    // Token revocation check: Compare with database token_version
    const user = await getUserById(decoded.userId);
    if (!user) {
      throw new AuthenticationError('User not found', { userId: decoded.userId });
    }

    const tokenVersionInToken = decoded.token_version;
    const currentTokenVersion = user.token_version ?? 0;

    if (typeof tokenVersionInToken === 'undefined' || tokenVersionInToken !== currentTokenVersion) {
      vaultLogger.security('Token revoked or invalid', {
        userId: decoded.userId,
        tokenVersion: tokenVersionInToken,
        currentVersion: currentTokenVersion
      });
      throw new InvalidTokenError('Token revoked', { reason: 'version_mismatch' });
    }

    // Attach decoded token to request
    req.user = decoded;
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = {
  authMiddleware
};
