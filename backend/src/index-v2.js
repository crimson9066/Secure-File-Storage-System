const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const csurf = require('csurf');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const filesRoutes = require('./routes/files-validated');
const chunkedRoutes = require('./routes/chunked');
const { authMiddleware, errorHandler } = require('./middleware/auth');
const logger = require('./utils/logger');

const app = express();
const PORT = process.env.PORT || 5000;

// Trust proxy when behind a load-balancer (set in production env if used)
if (process.env.TRUST_PROXY === '1') {
  app.set('trust proxy', 1);
}

// Security headers
app.use(helmet());

// CORS: whitelist from env or default localhost dev
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

// Body parsers with limits
app.use(express.json({ limit: process.env.BODY_LIMIT || '50mb' }));
app.use(express.urlencoded({ limit: process.env.BODY_LIMIT || '50mb', extended: true }));
app.use(cookieParser());

// Rate limiters
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

// CSRF protection
app.use(csurf({ cookie: true }));
app.get('/api/csrf-token', (req, res) => {
  res.json({ csrfToken: req.csrfToken() });
});

// Request logging middleware
app.use((req, res, next) => {
  logger.info('%s %s %s', req.method, req.path, req.ip);
  next();
});

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/files', authMiddleware, filesRoutes);
app.use('/api/files', authMiddleware, chunkedRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  logger.info('Secure File Storage Backend running on port %d', PORT);
  logger.info('Environment: %s', process.env.NODE_ENV || 'development');
});

module.exports = app;
