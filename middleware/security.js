const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { body, validationResult } = require('express-validator');
const sanitizeHtml = require('sanitize-html');
const constants = require('../config/constants');
const logger = require('../config/logger');

// Security headers middleware
const securityHeaders = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
});

// Rate limiting middleware
const createRateLimit = (config) => {
  return rateLimit({
    windowMs: config.windowMs,
    max: config.max,
    message: { error: config.message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        endpoint: req.path,
        method: req.method,
      });
      res.status(constants.HTTP_STATUS.TOO_MANY_REQUESTS).json({
        error: config.message,
        retryAfter: Math.round(config.windowMs / 1000),
      });
    },
  });
};

// Global rate limiter
const globalRateLimit = createRateLimit(constants.RATE_LIMITS.GLOBAL);

// Specific rate limiters
const uploadRateLimit = createRateLimit(constants.RATE_LIMITS.UPLOAD);
const chatRateLimit = createRateLimit(constants.RATE_LIMITS.CHAT);
const authRateLimit = createRateLimit(constants.RATE_LIMITS.AUTH);

// Input validation middleware
const validateInput = (validations) => {
  return async (req, res, next) => {
    // Run all validations
    await Promise.all(validations.map(validation => validation.run(req)));

    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Input validation failed', {
        errors: errors.array(),
        ip: req.ip,
        endpoint: req.path,
      });
      return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
        error: constants.ERRORS.VALIDATION_ERROR,
        details: errors.array(),
      });
    }
    next();
  };
};

// Input sanitization middleware
const sanitizeInput = (req, res, next) => {
  // Sanitize request body
  if (req.body) {
    for (const key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = sanitizeHtml(req.body[key], {
          allowedTags: [],
          allowedAttributes: {},
        });
      }
    }
  }

  // Sanitize query parameters
  if (req.query) {
    for (const key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = sanitizeHtml(req.query[key], {
          allowedTags: [],
          allowedAttributes: {},
        });
      }
    }
  }

  next();
};

// File validation middleware
const validateFile = (req, res, next) => {
  if (!req.file) {
    return next();
  }

  const file = req.file;
  
  // Check file size
  const maxSize = getMaxFileSize(file.mimetype);
  if (file.size > maxSize) {
    logger.warn('File size exceeded', {
      filename: file.originalname,
      size: file.size,
      maxSize,
      ip: req.ip,
    });
    return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
      error: constants.ERRORS.FILE_TOO_LARGE,
      maxSize: Math.round(maxSize / (1024 * 1024)) + 'MB',
    });
  }

  // Check file type
  if (!isAllowedFileType(file.mimetype)) {
    logger.warn('Invalid file type', {
      filename: file.originalname,
      mimetype: file.mimetype,
      ip: req.ip,
    });
    return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
      error: constants.ERRORS.INVALID_FILE_TYPE,
      allowedTypes: getAllowedFileTypes(),
    });
  }

  next();
};

// Helper functions
const getMaxFileSize = (mimetype) => {
  if (constants.FILES.ALLOWED_TYPES.PDF.includes(mimetype)) {
    return constants.FILES.MAX_SIZE.PDF;
  }
  if (constants.FILES.ALLOWED_TYPES.DOCUMENT.includes(mimetype)) {
    return constants.FILES.MAX_SIZE.DOCUMENT;
  }
  if (constants.FILES.ALLOWED_TYPES.IMAGE.includes(mimetype)) {
    return constants.FILES.MAX_SIZE.IMAGE;
  }
  return constants.FILES.MAX_SIZE.DOCUMENT; // Default
};

const isAllowedFileType = (mimetype) => {
  const allTypes = [
    ...constants.FILES.ALLOWED_TYPES.PDF,
    ...constants.FILES.ALLOWED_TYPES.DOCUMENT,
    ...constants.FILES.ALLOWED_TYPES.IMAGE,
  ];
  return allTypes.includes(mimetype);
};

const getAllowedFileTypes = () => {
  return {
    pdf: constants.FILES.ALLOWED_TYPES.PDF,
    documents: constants.FILES.ALLOWED_TYPES.DOCUMENT,
    images: constants.FILES.ALLOWED_TYPES.IMAGE,
  };
};

// Common validation rules
const validationRules = {
  title: body('title')
    .isLength({ min: 1, max: 255 })
    .withMessage('Title must be between 1 and 255 characters')
    .trim()
    .escape(),
  
  conversationId: body('conversationId')
    .isUUID()
    .withMessage('Invalid conversation ID format'),
  
  documentIds: body('documentIds')
    .optional()
    .isArray()
    .withMessage('Document IDs must be an array')
    .custom((value) => {
      if (value && value.length > 10) {
        throw new Error('Too many documents selected (max 10)');
      }
      return true;
    }),
  
  messages: body('messages')
    .isArray({ min: 1 })
    .withMessage('Messages must be a non-empty array')
    .custom((value) => {
      if (value.length > 50) {
        throw new Error('Too many messages (max 50)');
      }
      return true;
    }),
};

module.exports = {
  securityHeaders,
  globalRateLimit,
  uploadRateLimit,
  chatRateLimit,
  authRateLimit,
  validateInput,
  sanitizeInput,
  validateFile,
  validationRules,
};