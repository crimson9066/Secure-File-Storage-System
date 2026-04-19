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


// Initialize infrastructure
const metricsCollector = new MetricsCollector();
const gracefulDegradation = new GracefulDegradation();

const app = express();
const PORT = process.env.PORT || 5000;


if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

app.use(correlationIdMiddleware);

app.use(helmet());

const whitelist = (process.env.CORS_WHITELIST || 'http://localhost:3000,http://localhost:3001')
  .split(',')
  .map(s => s.trim());
app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      callback(new Error('CORS policy: This origin is not allowed'));
    }
  },
  credentials: true
}));

app.use(express.json({ limit: process.env.BODY_LIMIT || '50mb' }));
app.use(express.urlencoded({ limit: process.env.BODY_LIMIT || '50mb', extended: true }));
app.use(cookieParser());

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT || '10'),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' }
});

const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: parseInt(process.env.GLOBAL_RATE_LIMIT || '200'),
  standardHeaders: true,
  legacyHeaders: false
});

app.use(globalLimiter);

app.use(csurf({ cookie: true }));
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

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

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/files', authMiddleware, filesRoutes);
app.use('/api/chunked', authMiddleware, chunkedRoutes);

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

app.get('/api/metrics', (req, res) => {
  res.type('text/plain');
  res.send(metricsCollector.toPrometheus());
});

app.get('/api/degradation-status', (req, res) => {
  res.json(gracefulDegradation.getStatus());
});

app.use((req, res) => {
  res.status(404).json({
    error: 'Endpoint not found',
    path: req.path,
    method: req.method,
    traceId: req.traceId
  });
});

app.use((err, req, res, next) => {
  const traceId = req.traceId || 'unknown';
  
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

  if (err.code === 'EBADCSRFTOKEN') {
    vaultLogger.security('CSRF token validation failed', { traceId });
    return res.status(403).json({
      error: 'CSRF token invalid',
      code: 'CSRF_001'
    });
  }

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
