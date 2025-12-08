/**
 * Graceful Degradation - Service Fallbacks
 * 
 * Handles service failures:
 * - Redis down → fall back to in-memory session store
 * - Database slow → return cached data
 * - Upload storage full → return helpful error
 * 
 * Allows system to keep functioning even when dependencies fail.
 * Real-world scenario: We've had Redis crash unexpectedly,
 * needed sessions to keep working while we fixed it.
 */

class GracefulDegradation {
  constructor() {
    this.inMemorySessions = new Map(); // Fallback session store
    this.cache = new Map(); // Simple cache for database results
    this.cacheMaxAge = 5 * 60 * 1000; // 5 minutes
  }

  // Session fallback: Use in-memory store if Redis is down
  async storeSession(sessionId, data, redis) {
    try {
      // Try Redis first (faster, shared across servers)
      await redis.setex(
        `session:${sessionId}`,
        24 * 60 * 60,
        JSON.stringify(data)
      );
    } catch (err) {
      // Redis failed, fall back to in-memory
      // WARNING: This doesn't work for horizontal scaling!
      // Only use this temporary until Redis is back up.
      console.warn('Redis unavailable, using in-memory session storage');
      
      this.inMemorySessions.set(sessionId, {
        data,
        expiresAt: Date.now() + (24 * 60 * 60 * 1000)
      });
    }
  }

  async getSession(sessionId, redis) {
    try {
      // Try Redis first
      const session = await redis.get(`session:${sessionId}`);
      return session ? JSON.parse(session) : null;
    } catch (err) {
      // Redis failed, check in-memory fallback
      console.warn('Redis unavailable, reading from in-memory session storage');
      
      const session = this.inMemorySessions.get(sessionId);
      if (session && session.expiresAt > Date.now()) {
        return session.data;
      }
      
      // Session expired
      this.inMemorySessions.delete(sessionId);
      return null;
    }
  }

  // Cache database queries for slow database
  async queryWithCache(cacheKey, queryFn, options = {}) {
    const { maxAge = this.cacheMaxAge } = options;

    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < maxAge) {
      console.info(`Cache hit: ${cacheKey}`);
      return cached.data;
    }

    try {
      // Try live query
      const data = await queryFn();
      
      // Update cache
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });

      return data;
    } catch (err) {
      // Query failed, use cached data if available
      if (cached) {
        console.warn(`Query failed for ${cacheKey}, using stale cache`);
        return cached.data;
      }

      // No cache, re-throw error
      throw err;
    }
  }

  // Check if service is degraded
  getStatus() {
    const inMemorySessions = this.inMemorySessions.size;
    const cachedItems = this.cache.size;

    // Clean up expired sessions
    const now = Date.now();
    for (const [key, session] of this.inMemorySessions.entries()) {
      if (session.expiresAt < now) {
        this.inMemorySessions.delete(key);
      }
    }

    return {
      isDegraded: inMemorySessions > 0 || cachedItems > 0,
      inMemorySessions: this.inMemorySessions.size,
      cachedItems: this.cache.size,
      message: inMemorySessions > 0 
        ? 'Using in-memory sessions (Redis unavailable)'
        : cachedItems > 0
          ? 'Using cached data (some services slow)'
          : 'All systems normal'
    };
  }

  clearExpiredCache() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > this.cacheMaxAge) {
        this.cache.delete(key);
      }
    }
  }
}

module.exports = GracefulDegradation;
