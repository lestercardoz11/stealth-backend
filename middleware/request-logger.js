const morgan = require('morgan');
const { v4: uuidv4 } = require('uuid');
const logger = require('../config/logger');

// Add request ID to all requests
const addRequestId = (req, res, next) => {
  req.id = uuidv4();
  res.setHeader('X-Request-ID', req.id);
  next();
};

// Custom morgan token for request ID
morgan.token('id', (req) => req.id);

// Custom morgan token for user ID
morgan.token('user', (req) => req.user?.id || 'anonymous');

// Custom morgan format
const morganFormat = ':id :remote-addr :user ":method :url HTTP/:http-version" :status :res[content-length] ":referrer" ":user-agent" :response-time ms';

// Morgan middleware with Winston integration
const requestLogger = morgan(morganFormat, {
  stream: {
    write: (message) => {
      logger.info(message.trim());
    },
  },
});

// Detailed request/response logger
const detailedLogger = (req, res, next) => {
  const start = Date.now();
  
  // Log request
  logger.info('Incoming request', {
    requestId: req.id,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    contentType: req.get('Content-Type'),
    contentLength: req.get('Content-Length'),
    userId: req.user?.id,
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function(body) {
    const duration = Date.now() - start;
    
    logger.info('Outgoing response', {
      requestId: req.id,
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: JSON.stringify(body).length,
      userId: req.user?.id,
    });

    return originalJson.call(this, body);
  };

  next();
};

// Security event logger
const logSecurityEvent = (event, req, details = {}) => {
  logger.warn('Security event', {
    event,
    requestId: req.id,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    ...details,
  });
};

// Performance monitoring
const performanceMonitor = (req, res, next) => {
  const start = process.hrtime.bigint();
  const startMemory = process.memoryUsage();

  res.on('finish', () => {
    const end = process.hrtime.bigint();
    const endMemory = process.memoryUsage();
    
    const duration = Number(end - start) / 1000000; // Convert to milliseconds
    const memoryDelta = endMemory.heapUsed - startMemory.heapUsed;

    // Log slow requests
    if (duration > 1000) { // Log requests taking more than 1 second
      logger.warn('Slow request detected', {
        requestId: req.id,
        method: req.method,
        url: req.url,
        duration: `${duration.toFixed(2)}ms`,
        memoryDelta: `${(memoryDelta / 1024 / 1024).toFixed(2)}MB`,
        statusCode: res.statusCode,
      });
    }

    // Log high memory usage
    if (memoryDelta > 50 * 1024 * 1024) { // Log if memory delta > 50MB
      logger.warn('High memory usage detected', {
        requestId: req.id,
        method: req.method,
        url: req.url,
        memoryDelta: `${(memoryDelta / 1024 / 1024).toFixed(2)}MB`,
        heapUsed: `${(endMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
      });
    }
  });

  next();
};

module.exports = {
  addRequestId,
  requestLogger,
  detailedLogger,
  logSecurityEvent,
  performanceMonitor,
};