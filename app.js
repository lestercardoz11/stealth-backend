const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const pdfService = require('./services/pdf-service');
const docService = require('./services/doc-service');
const ocrService = require('./services/ocr-service');
const storageService = require('./services/storage-service');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

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
      console.warn('⚠️ Warning: Could not initialize Supabase Storage bucket');
    }
  } catch (error) {
    console.error('❌ Error initializing app:', error);
  }
};
// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Text Extraction Microservices API',
    version: '1.0.0',
    storage: 'Supabase Storage',
    endpoints: {
      '/extract': 'POST - Upload file for text extraction',
      '/health': 'GET - Health check',
      '/supported-formats': 'GET - List supported file formats'
    }
  });
});

app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    storage: 'supabase',
    services: {
      pdf: 'online',
      doc: 'online',
      ocr: 'online'
    }
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

app.post('/extract', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please upload a file to extract text from'
      });
    }

    const { mimetype, originalname, size, path: tempFilePath } = req.file;
    
    console.log(`Processing file: ${originalname} (${mimetype}, ${size} bytes)`);

    let storageInfo = null;
    let downloadedFilePath = null;

    try {
      storageInfo = await storageService.uploadFile(tempFilePath, originalname, mimetype);
      console.log(`File uploaded to storage: ${storageInfo.path}`);

      // Download file from storage for processing
      downloadedFilePath = await storageService.downloadFile(storageInfo.path);

      // Determine which service to use
      const service = getServiceForFile(mimetype);
      
      if (!service) {
        // Clean up files
        cleanupTempFile(tempFilePath);
        if (downloadedFilePath) storageService.cleanupTempFile(downloadedFilePath);
        if (storageInfo) await storageService.deleteFile(storageInfo.path);
        
        return res.status(400).json({
          error: 'Unsupported file type',
          message: 'Please upload a PDF, DOC, DOCX, or image file'
        });
      }

      // Extract text using the appropriate service
      const result = await service.extractText(downloadedFilePath);
      
      // Clean up temporary files (keep the file in Supabase Storage)
      cleanupTempFile(tempFilePath);
      if (downloadedFilePath) storageService.cleanupTempFile(downloadedFilePath);

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
      console.error('Storage operation error:', storageError);
      
      // Clean up files on storage error
      cleanupTempFile(tempFilePath);
      if (downloadedFilePath) storageService.cleanupTempFile(downloadedFilePath);
      if (storageInfo) await storageService.deleteFile(storageInfo.path);
      
      throw storageError;
    }

  } catch (error) {
    console.error('Text extraction error:', error);
    
    // Clean up temp file in case of error
    if (req.file && req.file.path) {
      cleanupTempFile(req.file.path);
    }

    res.status(500).json({
      error: 'Text extraction failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size must be less than 10MB'
      });
    }
  }
  
  res.status(500).json({
    error: 'Internal server error',
    message: error.message
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

app.listen(PORT, () => {
  console.log(`🚀 Text Extraction API running on port ${PORT}`);
  console.log(`☁️ Using Supabase Storage for file uploads`);
  console.log(`📁 Temp directory: ${tempDir}`);
  console.log(`🔗 API endpoint: http://localhost:${PORT}`);
  
  // Initialize app
  initializeApp();
});