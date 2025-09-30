const express = require('express');
const compression = require('compression');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

// Import configuration and utilities
const constants = require('./config/constants');
const logger = require('./config/logger');

// Import security middleware
const {
  securityHeaders,
  globalRateLimit,
  sanitizeInput,
} = require('./middleware/security');

// Import error handling
const {
  globalErrorHandler,
  notFoundHandler,
  asyncHandler,
} = require('./middleware/error-handler');

// Import request logging
const {
  addRequestId,
  requestLogger,
  performanceMonitor,
} = require('./middleware/request-logger');

// Import services
const pdfService = require('./services/pdf-service');
const docService = require('./services/doc-service');
const ocrService = require('./services/ocr-service');
const storageService = require('./services/storage-service');

// Import route modules
const conversationsRouter = require('./routes/conversations');
const chatRouter = require('./routes/chat');
const documentsRouter = require('./routes/documents');

const app = express();
const PORT = constants.SERVER.PORT;

// Trust proxy for accurate IP addresses
app.set('trust proxy', 1);

// Security middleware (must be first)
app.use(securityHeaders);
app.use(globalRateLimit);

// Request processing middleware
app.use(compression());
app.use(addRequestId);
app.use(requestLogger);
app.use(performanceMonitor);

// CORS configuration
const corsOptions = {
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
};
app.use(require('cors')(corsOptions));

// Body parsing middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(sanitizeInput);

// Create temp directory for temporary file processing
const tempDir = path.join(__dirname, 'temp');
if (!fs.existsSync(tempDir)) {
  fs.mkdirSync(tempDir, { recursive: true });
}

// Configure multer for temporary file uploads (before uploading to Supabase)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'temp/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/png',
      'image/jpeg',
      'image/jpg',
      'image/gif',
      'image/bmp',
      'image/tiff'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Unsupported file type'), false);
    }
  }
});

// Helper function to determine service based on file type
const getServiceForFile = (mimetype) => {
  if (mimetype === 'application/pdf') {
    return pdfService;
  } else if (mimetype === 'application/msword' || 
             mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
    return docService;
  } else if (mimetype.startsWith('image/')) {
    return ocrService;
  }
  return null;
};

// Helper function to clean up temporary file
const cleanupTempFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error cleaning up temp file:', error);
  }
};

// Initialize Supabase Storage on startup
const initializeApp = async () => {
  try {
    const bucketInitialized = await storageService.initializeBucket();
    if (!bucketInitialized) {
      logger.warn('Could not initialize Supabase Storage bucket');
      logger.info('Supabase Storage bucket initialized successfully');
    }
  } catch (error) {
    logger.error('Error initializing application', { error: error.message });
  }
};
// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Text Extraction Microservices API',
    version: constants.SERVER.API_VERSION,
    environment: constants.SERVER.NODE_ENV,
    storage: 'Supabase Storage',
    timestamp: new Date().toISOString(),
    endpoints: {
      '/extract': 'POST - Upload file for text extraction',
      '/api/conversations': 'Conversation management endpoints',
      '/api/chat': 'Chat and AI interaction endpoints',
      '/api/documents': 'Document management endpoints',
      '/health': 'GET - Health check',
      '/supported-formats': 'GET - List supported file formats'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    memory: process.memoryUsage(),
    timestamp: new Date().toISOString(),
    storage: 'supabase',
    services: {
      pdf: 'online',
      doc: 'online',
      ocr: 'online',
      storage: 'online',
    },
    version: constants.SERVER.API_VERSION,
    environment: constants.SERVER.NODE_ENV,
  });
});

app.get('/supported-formats', (req, res) => {
  res.json({
    formats: {
      pdf: ['application/pdf'],
      documents: [
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ],
      images: [
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/gif',
        'image/bmp',
        'image/tiff'
      ]
    }
  });
});

// Mount new API routes
app.use('/api/conversations', conversationsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/documents', documentsRouter);

// Wrap the extract endpoint with async handler and enhanced error handling
app.post('/extract', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) {
      return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
        error: 'No file uploaded',
        message: 'Please upload a file to extract text from'
      });
    }

    const { mimetype, originalname, size, path: tempFilePath } = req.file;
    
    logger.info('Processing file for text extraction', {
      filename: originalname,
      mimetype,
      size,
      requestId: req.id,
    });

    let storageInfo = null;
    let downloadedFilePath = null;

    try {
      storageInfo = await storageService.uploadFile(tempFilePath, originalname, mimetype);
      logger.info('File uploaded to storage', {
        path: storageInfo.path,
        filename: originalname,
        requestId: req.id,
      });

      // Download file from storage for processing
      downloadedFilePath = await storageService.downloadFile(storageInfo.path);

      // Determine which service to use
      const service = getServiceForFile(mimetype);
      
      if (!service) {
        // Clean up files
        cleanupTempFile(tempFilePath);
        if (downloadedFilePath) storageService.cleanupTempFile(downloadedFilePath);
        if (storageInfo) await storageService.deleteFile(storageInfo.path);
        
        return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({
          error: 'Unsupported file type',
          message: 'Please upload a PDF, DOC, DOCX, or image file'
        });
      }

      // Extract text using the appropriate service
      const result = await service.extractText(downloadedFilePath);
      
      // Clean up temporary files (keep the file in Supabase Storage)
      cleanupTempFile(tempFilePath);
      if (downloadedFilePath) storageService.cleanupTempFile(downloadedFilePath);

      logger.info('Text extraction completed successfully', {
        filename: originalname,
        textLength: result.text.length,
        processingTime: result.processingTime,
        requestId: req.id,
      });

      // Return the extracted text
      res.json({
        success: true,
        filename: originalname,
        fileType: mimetype,
        fileSize: size,
        storageInfo: {
          path: storageInfo.path,
          fileName: storageInfo.fileName
        },
        extractedText: result.text,
        wordCount: result.text.split(/\s+/).filter(word => word.length > 0).length,
        processingTime: result.processingTime,
        timestamp: new Date().toISOString()
      });

    } catch (storageError) {
      logger.error('Storage operation error', {
        error: storageError.message,
        filename: originalname,
        requestId: req.id,
      });
      
      // Clean up files on storage error
      cleanupTempFile(tempFilePath);
      if (downloadedFilePath) storageService.cleanupTempFile(downloadedFilePath);
      if (storageInfo) await storageService.deleteFile(storageInfo.path);
      
      throw storageError;
    }
}));

// Global error handling middleware
app.use(globalErrorHandler);

// 404 handler (must be last)
app.use(notFoundHandler);

app.listen(PORT, () => {
  logger.info('Server started successfully', {
    port: PORT,
    environment: constants.SERVER.NODE_ENV,
    version: constants.SERVER.API_VERSION,
    tempDir,
  });
  
  console.log(`🚀 Text Extraction API running on port ${PORT}`);
  console.log(`🌍 Environment: ${constants.SERVER.NODE_ENV}`);
  console.log(`☁️ Using Supabase Storage for file uploads`);
  console.log(`🔗 API endpoint: http://localhost:${PORT}`);
  
  // Initialize app
  initializeApp();
});