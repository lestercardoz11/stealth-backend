// Application constants and configuration
const constants = {
  // Server configuration
  SERVER: {
    PORT: process.env.PORT || 3000,
    NODE_ENV: process.env.NODE_ENV || 'development',
    API_VERSION: 'v1',
    REQUEST_TIMEOUT: 30000, // 30 seconds
  },

  // Security configuration
  SECURITY: {
    BCRYPT_ROUNDS: 12,
    JWT_EXPIRY: '24h',
    MAX_LOGIN_ATTEMPTS: 5,
    LOCKOUT_TIME: 15 * 60 * 1000, // 15 minutes
    SESSION_SECRET: process.env.SESSION_SECRET || 'your-secret-key-change-in-production',
  },

  // Rate limiting configuration
  RATE_LIMITS: {
    GLOBAL: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 1000, // requests per window
      message: 'Too many requests from this IP, please try again later.',
    },
    UPLOAD: {
      windowMs: 60 * 1000, // 1 minute
      max: 10, // uploads per window
      message: 'Too many file uploads, please try again later.',
    },
    CHAT: {
      windowMs: 60 * 1000, // 1 minute
      max: 30, // chat requests per window
      message: 'Too many chat requests, please try again later.',
    },
    AUTH: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // auth attempts per window
      message: 'Too many authentication attempts, please try again later.',
    },
  },

  // File configuration
  FILES: {
    MAX_SIZE: {
      PDF: 10 * 1024 * 1024, // 10MB
      DOCUMENT: 50 * 1024 * 1024, // 50MB
      IMAGE: 8 * 1024 * 1024, // 8MB
    },
    ALLOWED_TYPES: {
      PDF: ['application/pdf'],
      DOCUMENT: [
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
      ],
      IMAGE: [
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/gif',
        'image/bmp',
        'image/tiff',
      ],
    },
    TEMP_DIR: 'temp',
    UPLOAD_DIR: 'uploads',
  },

  // Database configuration
  DATABASE: {
    CONNECTION_TIMEOUT: 10000,
    QUERY_TIMEOUT: 30000,
    MAX_CONNECTIONS: 20,
  },

  // Supabase configuration
  SUPABASE: {
    BUCKET_NAME: 'document-uploads',
    SIGNED_URL_EXPIRY: 3600, // 1 hour
  },

  // Audit logging
  AUDIT: {
    ACTIONS: {
      USER_LOGIN: 'USER_LOGIN',
      USER_LOGOUT: 'USER_LOGOUT',
      DOCUMENT_UPLOAD: 'DOCUMENT_UPLOAD',
      DOCUMENT_DELETE: 'DOCUMENT_DELETE',
      DOCUMENT_ACCESS: 'DOCUMENT_ACCESS',
      CHAT_REQUEST: 'CHAT_REQUEST',
      RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
      UNAUTHORIZED_ACCESS: 'UNAUTHORIZED_ACCESS',
      SECURITY_VIOLATION: 'SECURITY_VIOLATION',
    },
    SEVERITY: {
      LOW: 'low',
      MEDIUM: 'medium',
      HIGH: 'high',
      CRITICAL: 'critical',
    },
  },

  // HTTP status codes
  HTTP_STATUS: {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    UNAUTHORIZED: 401,
    FORBIDDEN: 403,
    NOT_FOUND: 404,
    CONFLICT: 409,
    UNPROCESSABLE_ENTITY: 422,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500,
    SERVICE_UNAVAILABLE: 503,
  },

  // Error messages
  ERRORS: {
    VALIDATION_ERROR: 'Validation failed',
    UNAUTHORIZED: 'Unauthorized access',
    FORBIDDEN: 'Access forbidden',
    NOT_FOUND: 'Resource not found',
    INTERNAL_ERROR: 'Internal server error',
    RATE_LIMIT: 'Rate limit exceeded',
    FILE_TOO_LARGE: 'File size exceeds limit',
    INVALID_FILE_TYPE: 'Invalid file type',
    UPLOAD_FAILED: 'File upload failed',
    PROCESSING_FAILED: 'File processing failed',
  },
};

module.exports = constants;