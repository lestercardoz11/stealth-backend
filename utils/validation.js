const Joi = require('joi');
const constants = require('../config/constants');

// Common validation schemas
const schemas = {
  // User validation
  userId: Joi.string().uuid().required(),
  email: Joi.string().email().max(255).required(),
  
  // Document validation
  documentId: Joi.string().uuid().required(),
  documentTitle: Joi.string().min(1).max(255).trim().required(),
  documentIds: Joi.array().items(Joi.string().uuid()).max(10).optional(),
  
  // File validation
  fileSize: Joi.number().positive().max(constants.FILES.MAX_SIZE.DOCUMENT),
  fileType: Joi.string().valid(...Object.values(constants.FILES.ALLOWED_TYPES).flat()),
  
  // Chat validation
  messages: Joi.array().items(
    Joi.object({
      role: Joi.string().valid('user', 'assistant', 'system').required(),
      content: Joi.string().min(1).max(10000).required(),
    })
  ).min(1).max(50).required(),
  
  // Conversation validation
  conversationId: Joi.string().uuid().required(),
  conversationTitle: Joi.string().min(1).max(255).trim().optional(),
  
  // Pagination validation
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(1).max(100).default(20),
  
  // Query validation
  query: Joi.string().min(1).max(1000).trim().required(),
  
  // Boolean validation
  isCompanyWide: Joi.boolean().default(false),
  
  // Date validation
  dateRange: Joi.object({
    startDate: Joi.date().iso().optional(),
    endDate: Joi.date().iso().min(Joi.ref('startDate')).optional(),
  }).optional(),
};

// Validation middleware factory
const validate = (schema, property = 'body') => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req[property], {
      abortEarly: false,
      stripUnknown: true,
      convert: true,
    });

    if (error) {
      const details = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value,
      }));

      return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
        error: constants.ERRORS.VALIDATION_ERROR,
        details,
        timestamp: new Date().toISOString(),
      });
    }

    // Replace the original data with validated and sanitized data
    req[property] = value;
    next();
  };
};

// Specific validation schemas for endpoints
const validationSchemas = {
  // Document upload
  uploadDocument: Joi.object({
    title: schemas.documentTitle,
    isCompanyWide: schemas.isCompanyWide,
  }),

  // Document list
  listDocuments: Joi.object({
    userId: schemas.userId.optional(),
    companyWideOnly: Joi.boolean().optional(),
    page: schemas.page,
    limit: schemas.limit,
  }),

  // Chat request
  chatRequest: Joi.object({
    messages: schemas.messages,
    documentIds: schemas.documentIds,
  }),

  // Generate conversation title
  generateTitle: Joi.object({
    conversationId: schemas.conversationId,
    messages: schemas.messages,
  }),

  // Get document URL
  getDocumentUrl: Joi.object({
    filePath: Joi.string().min(1).max(500).required(),
  }),

  // Delete document
  deleteDocument: Joi.object({
    id: schemas.documentId,
  }),

  // Text extraction
  extractText: Joi.object({
    // File validation handled by multer and file validator
  }),
};

// Custom validation functions
const customValidators = {
  // Validate file extension matches MIME type
  validateFileConsistency: (file) => {
    const extensionMap = {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'text/plain': ['.txt'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/gif': ['.gif'],
      'image/bmp': ['.bmp'],
      'image/tiff': ['.tiff', '.tif'],
    };

    const allowedExtensions = extensionMap[file.mimetype] || [];
    const fileExtension = file.originalname.toLowerCase().split('.').pop();
    
    return allowedExtensions.some(ext => ext.substring(1) === fileExtension);
  },

  // Validate file content (basic magic number check)
  validateFileContent: (buffer, mimetype) => {
    const magicNumbers = {
      'application/pdf': [0x25, 0x50, 0x44, 0x46], // %PDF
      'image/jpeg': [0xFF, 0xD8, 0xFF],
      'image/png': [0x89, 0x50, 0x4E, 0x47],
      'image/gif': [0x47, 0x49, 0x46],
    };

    const expectedMagic = magicNumbers[mimetype];
    if (!expectedMagic) return true; // Skip validation for unsupported types

    const fileHeader = Array.from(buffer.slice(0, expectedMagic.length));
    return expectedMagic.every((byte, index) => byte === fileHeader[index]);
  },

  // Sanitize filename
  sanitizeFilename: (filename) => {
    return filename
      .replace(/[^a-zA-Z0-9.-]/g, '_') // Replace special chars with underscore
      .replace(/_{2,}/g, '_') // Replace multiple underscores with single
      .replace(/^_+|_+$/g, '') // Remove leading/trailing underscores
      .substring(0, 255); // Limit length
  },
};

module.exports = {
  schemas,
  validate,
  validationSchemas,
  customValidators,
};