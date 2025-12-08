/**
 * Request Correlation & Tracing Middleware
 * 
 * Adds X-Trace-ID to every request/response.
 * Makes it easy to follow request flow across logs.
 * Critical for debugging distributed system issues.
 * 
 * If client sends X-Trace-ID, we use it.
 * Otherwise, generate a new UUID.
 * Attach to res headers so client sees it in responses.
 */

const { v4: uuid } = require('uuid');
const vaultLogger = require('../utils/vaultLogger');

const correlationIdMiddleware = (req, res, next) => {
  // Use client's trace ID if provided, otherwise generate
  req.traceId = req.headers['x-trace-id'] || uuid();
  
  // Attach to response headers
  res.setHeader('X-Trace-ID', req.traceId);
  
  // Attach to logger metadata so all logs include it
  req.log = vaultLogger.child({ traceId: req.traceId, ip: req.ip });
  
  // Track response time
  const startTime = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const level = res.statusCode >= 400 ? 'warn' : 'info';
    
    req.log[level](
      `${req.method} ${req.path}`,
      {
        statusCode: res.statusCode,
        duration: `${duration}ms`,
        contentLength: res.get('content-length') || 0,
        userId: req.user?.id || 'anonymous'
      }
    );
  });
  
  next();
};

module.exports = correlationIdMiddleware;
