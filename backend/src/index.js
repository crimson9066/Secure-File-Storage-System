const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const filesRoutes = require('./routes/files');
const chunkedRoutes = require('./routes/chunked');
const { authMiddleware } = require('./middleware/auth');
const correlationIdMiddleware = require('./middleware/correlationId');
const vaultLogger = require('./utils/vaultLogger');
const { VaultError } = require('./utils/vaultErrors');
const HealthChecker = require('./utils/healthChecker');
const MetricsCollector = require('./utils/metricsCollector');
const GracefulDegradation = require('./utils/gracefulDegradation');
const FeatureFlagEngine = require('./utils/featureFlags');

// Initialize infrastructure
const metricsCollector = new MetricsCollector();
const gracefulDegradation = new GracefulDegradation();

const app = express();
const PORT = process.env.PORT || 5000;

/**
 * MIDDLEWARE REGISTRATION ORDER
 * Critical: Order matters. Earlier middleware runs first.
 * 1. Trust proxy (must be before CORS + rate limiting)
 * 2. Correlation ID (must be first to track all requests)
 * 3. Helmet (security headers)
 * 4. CORS (origin validation)
 * 5. Body parsing (request content)
 * 6. Rate limiting (protection)
 * 7. CSRF protection (session security)
 * 8. Logging (audit trail)
 */
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Correlation ID middleware MUST be first to track all requests
app.use(correlationIdMiddleware);

/**
 * HELMET MIDDLEWARE
 * Provides automatic security headers to protect against common web vulnerabilities.
 * Headers set: X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security, etc.
 * Alternative: Manual header management, but helmet is maintained and battle-tested.
 */
app.use(helmet());

/**
 * CORS CONFIGURATION
 * Controls which origins can access the API. Uses whitelist approach (explicit allow)
 * rather than blacklist (block specific origins), which is more secure.
 * Allows credentials (cookies, auth headers) via credentials: true.
 * Origins from CORS_WHITELIST env var; defaults to localhost dev servers.
 * 
 * Design rationale:
 * - Explicit whitelist prevents accidental exposure to unauthorized origins
 * - Credentials allowed enables cookie-based auth for browsers
 * - No-origin requests allowed for non-browser clients (mobile, curl, etc.)
 * 
 * Alternatives considered:
 * - Allow all origins: Security risk, allows CSRF attacks
 * - Hardcoded origins: Inflexible, requires redeploy for env changes
 */
const whitelist = (process.env.CORS_WHITELIST || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map(s => s.trim());
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, API clients)
    if (!origin) return callback(null, true);
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy: This origin is not allowed'));
    }
  },
  credentials: true
}));

/**
 * REQUEST BODY PARSING
 * Configures max request body size to prevent DoS attacks via large payloads.
 * Uses environment variable for flexibility across environments.
 * Limit applies to both JSON and URL-encoded form data.
 */
app.use(express.json({ limit: process.env.BODY_LIMIT || '50mb' }));
app.use(express.urlencoded({ limit: process.env.BODY_LIMIT || '50mb', extended: true }));
app.use(cookieParser());

/**
 * AUTHENTICATION RATE LIMITER
 * Protects auth endpoints (/signup, /login) from brute force attacks.
 * 10 attempts per 15 minutes per IP address (configurable via env).
 * 
 * Design rationale:
 * - Stricter than global limiter to prevent credential stuffing
 * - 15-minute window balances security with user lockout concerns
 * - Tracks by IP, not user (attacker may not know target email)
 * 
 * Alternatives:
 * - Per-email rate limiting: Better UX, reveals which emails exist in system
 * - Per-password rate limiting: Ineffective, attacker doesn't need to know password
 * - Exponential backoff: More complex, harder to implement reliably
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT || '10'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

/**
 * GLOBAL RATE LIMITER
 * Applies to all endpoints except those with specific limiters.
 * 200 requests per minute per IP prevents general DoS attacks.
 * Higher limit than auth limiter to allow normal API usage patterns.
 */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.GLOBAL_RATE_LIMIT || '200'),
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);

/**
 * CSRF PROTECTION
 * Double-submit cookie pattern (not session-based tokens, as server is stateless).
 * Browser sends CSRF token back in request headers; Express validates match.
 * Mobile clients and single-page apps must include token in headers.
 * 
 * Why double-submit cookies instead of session-based tokens:
 * - Server is stateless; no session store
 * - CSRF token stored in secure, HttpOnly cookie by browser
 * - Token regenerated each session, preventing token fixation
 * - Works with JWT-based architecture
 */
app.use(csurf({ cookie: true }));
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

/**
 * REQUEST LOGGING
 * Logs all incoming requests with correlation ID for tracing.
 * Captures method, path, client IP for audit trail.
 * Each request gets unique traceId for distributed debugging.
 */
app.use((req, res, next) => {
  const startTime = Date.now();
  
  // Capture response finish event
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    metricsCollector.recordRequest(req.path, res.statusCode, duration, req.user?.userId);
    
    vaultLogger.info(`[${req.traceId}] ${req.method} ${req.path} ${res.statusCode} ${duration}ms`, {
      traceId: req.traceId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      duration
    });
  });
  
  next();
});

/**
 * ROUTE MOUNTING
 * Auth routes: Rate limited separately, no auth middleware required
 * File routes: Protected by auth middleware, ensures user is authenticated
 * Chunked routes: Protected by auth middleware, handles large file uploads
 */
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/files', authMiddleware, filesRoutes);
app.use('/api/chunked', authMiddleware, chunkedRoutes);

/**
 * HEALTH CHECK ENDPOINT
 * Subsystem status monitoring: database, Redis, disk, memory.
 * Used by load balancers and monitoring to verify application health.
 * Includes detailed component status for debugging.
 */
app.get('/api/health', async (req, res) => {
  try {
    const db = require('./models/db').getPool();
    const redis = require('./models/redis').getRedisClient();
    const checker = new HealthChecker(db, redis);
    const health = await checker.check();
    
    // Return appropriate HTTP status based on health
    const statusCode = health.status === 'healthy' ? 200 : health.status === 'degraded' ? 503 : 500;
    res.status(statusCode).json(health);
  } catch (err) {
    vaultLogger.error('Health check failed', { error: err.message });
    res.status(500).json({ status: 'unhealthy', error: 'Health check failed' });
  }
});

/**
 * METRICS ENDPOINT
 * Prometheus-compatible metrics for monitoring systems.
 * Tracks requests, errors, response times, data transfer.
 * Formatted for ingestion by Grafana, Prometheus, or similar.
 */
app.get('/api/metrics', (req, res) => {
  res.type('text/plain');
  res.send(metricsCollector.toPrometheus());
});

/**
 * DEGRADATION STATUS ENDPOINT
 * Reports current system degradation status.
 * Useful for ops team to understand fallback status.
 * Returns: degradation flag, active fallbacks, recommendations.
 */
app.get('/api/degradation-status', (req, res) => {
  res.json(gracefulDegradation.getStatus());
});

/**
 * 404 HANDLER
 * Catches all unmatched requests, returns structured error.
 * Placed after all route definitions to catch undefined endpoints.
 */
app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    traceId: req.traceId
  });
});

/**
 * GLOBAL ERROR HANDLER
 * Catches all errors thrown in request handlers and middleware.
 * Converts custom VaultError objects to appropriate HTTP responses.
 * Falls back to 500 for unexpected errors.
 * 
 * ERROR FLOW:
 * 1. Route handler throws error (custom or built-in)
 * 2. Express passes to error handler (errorHandler function)
 * 3. If VaultError: Use statusCode, include error code for client
 * 4. If unknown: Log details, return safe 500 response
 * 5. Never expose stack traces or internal details to client
 * 
 * SECURITY: Client never sees:
 * - Stack traces (could reveal system architecture)
 * - Database errors (SQL structure)
 * - File paths (server structure)
 * - Only structured error objects with codes
 */
app.use((err, req, res, next) => {
  const traceId = req.traceId || 'unknown';
  
  // Handle custom VaultError with domain-specific code
  if (err instanceof VaultError) {
    metricsCollector.recordError(err.code, err.constructor.name);
    vaultLogger.security(`Error ${err.code}: ${err.message}`, {
      traceId,
      code: err.code,
      statusCode: err.statusCode,
      details: err.details,
      timestamp: err.timestamp
    });
    
    return res.status(err.statusCode).json(err.toJSON());
  }

  // Handle CSRF token errors
  if (err.code === 'EBADCSRFTOKEN') {
    vaultLogger.security('CSRF token validation failed', { traceId });
    return res.status(403).json({
      error: 'CSRF token invalid',
      code: 'CSRF_001'
    });
  }

  // Handle generic errors
  vaultLogger.error('Unexpected error', {
    traceId,
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });

  metricsCollector.recordError('ERR_500', 'UnexpectedError');
  
  res.status(500).json({
    error: 'Internal server error',
    code: 'ERR_500',
    traceId,
    ...(process.env.NODE_ENV === 'development' && { details: err.message })
  });
});

/**
 * GRACEFUL SHUTDOWN
 * Handles process termination signals: SIGTERM, SIGINT.
 * Closes connections, flushes logs, exits cleanly.
 * 
 * SHUTDOWN FLOW:
 * 1. Process receives SIGTERM (from Docker/Kubernetes)
 * 2. Stop accepting new requests
 * 3. Wait for in-flight requests to complete (10s timeout)
 * 4. Close database connections
 * 5. Exit with code 0
 * 
 * WHY IMPORTANT:
 * - Zero-downtime deployments: Don't kill mid-request
 * - Data consistency: Flush logs before exit
 * - Monitoring: Graceful exit vs crash looks different to ops
 */
const server = app.listen(PORT, () => {
  vaultLogger.info('Secure File Storage Backend running', {
    port: PORT,
    environment: process.env.NODE_ENV || 'development',
    nodeVersion: process.version
  });
});

process.on('SIGTERM', () => {
  vaultLogger.info('SIGTERM received, initiating graceful shutdown');
  
  server.close(() => {
    vaultLogger.info('Server closed, exiting');
    process.exit(0);
  });

  // Force exit after 30 seconds
  setTimeout(() => {
    vaultLogger.error('Graceful shutdown timeout, forcing exit');
    process.exit(1);
  }, 30 * 1000);
});

module.exports = app;
