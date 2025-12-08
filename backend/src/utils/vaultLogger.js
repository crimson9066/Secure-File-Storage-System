/**
 * Custom VaultLogger - Domain-specific logging with audit level
 * 
 * Adds "audit" level for security events (logins, key changes, shares)
 * Makes it easy to find security-relevant events in logs
 * 
 * Usage:
 *   vaultLogger.audit('User login', { userId, email, ipAddress });
 *   vaultLogger.security('Invalid password attempt', { userId, attempts });
 *   vaultLogger.error('Encryption failed', { fileId, reason });
 */

const winston = require('winston');
const path = require('path');

const customLevels = {
  levels: {
    audit: 0,      // Security audit events (logins, key changes, deletions)
    security: 1,   // Security warnings (failed auth, rate limit)
    error: 2,
    warn: 3,
    info: 4,
    debug: 5
  },
  colors: {
    audit: 'yellow bold',
    security: 'red bold',
    error: 'red',
    warn: 'yellow',
    info: 'green',
    debug: 'blue'
  }
};

// Ensure logs directory exists
const logsDir = path.join(__dirname, '../../logs');
const fs = require('fs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

const vaultLogger = winston.createLogger({
  levels: customLevels.levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    // Custom formatting for readability
    winston.format.printf(({ level, message, timestamp, ...meta }) => {
      const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
      return `[${timestamp}] [${level.toUpperCase()}] ${message} ${metaStr}`;
    })
  ),
  defaultMeta: { service: 'securevault' },
  transports: [
    // Separate audit log file (immutable record for compliance)
    new winston.transports.File({
      filename: path.join(logsDir, 'audit.log'),
      level: 'audit',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json() // JSON for audit trails
      )
    }),
    // Security events in separate file
    new winston.transports.File({
      filename: path.join(logsDir, 'security.log'),
      level: 'security',
      format: winston.format.json()
    }),
    // All errors
    new winston.transports.File({
      filename: path.join(logsDir, 'error.log'),
      level: 'error'
    }),
    // Combined log
    new winston.transports.File({
      filename: path.join(logsDir, 'combined.log')
    })
  ]
});

// Console output for development
if (process.env.NODE_ENV !== 'production') {
  winston.addColors(customLevels.colors);
  vaultLogger.add(
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize({ all: true }),
        winston.format.timestamp({ format: 'HH:mm:ss' }),
        winston.format.printf(({ level, message, timestamp, ...meta }) => {
          const metaStr = Object.keys(meta).length ? '\n' + JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}] ${message}${metaStr}`;
        })
      )
    })
  );
}

module.exports = vaultLogger;
