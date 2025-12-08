const { verifyToken } = require('../utils/auth');
const { getUserById } = require('../models/user');
const vaultLogger = require('../utils/vaultLogger');
const { InvalidTokenError, AuthenticationError } = require('../utils/vaultErrors');

/**
 * AUTHENTICATION MIDDLEWARE
 * Validates JWT tokens and enforces token revocation via token_version field.
 * 
 * FLOW:
 * 1. Extract Bearer token from Authorization header
 * 2. Verify JWT signature, expiration, and basic claims
 * 3. Query database for current user to fetch active token_version
 * 4. Compare token's embedded token_version with database value
 * 5. If versions don't match, token is considered revoked
 * 
 * WHY THIS APPROACH (Stateless Token Revocation):
 * - Traditional approach: Keep revocation list in memory/cache (loses data on restart)
 * - Database lookup approach (used here):
 *   - Requires synchronous token_version check
 *   - Ensures revocation across all server instances
 *   - Single database field (token_version) to invalidate all old tokens
 *   - Token_version incremented on password change, private key update, manual logout
 * 
 * TRADE-OFFS:
 * - Pro: True stateless revocation, no cache needed, simple implementation
 * - Con: One extra database query per request (negligible for most workloads)
 * 
 * ALTERNATIVES CONSIDERED:
 * - Redis-backed revocation list: Requires cache, loses data on restart (bad)
 * - Server restart clears tokens: Unreliable, breaks multi-instance deployments
 * - No revocation: Tokens live until expiration (security risk if key compromised)
 * - Token blacklist in DB: Same cost as token_version but more complex
 * 
 * SECURITY NOTES:
 * - Only async because database lookup is I/O; necessary for revocation to work
 * - token_version assumed immutable after JWT issued (user can't change once logged in)
 * - Revocation is atomic: incrementing token_version invalidates all existing tokens
 */
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
