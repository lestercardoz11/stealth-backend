const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const mammoth = require('mammoth');
const pdfParse = require('pdf-parse');
const router = express.Router();
const supabase = require('../config/supabase');
const constants = require('../config/constants');
const logger = require('../config/logger');
const { asyncHandler } = require('../middleware/error-handler');
const { uploadRateLimit, validateFile, validateInput, validationRules } = require('../middleware/security');
const { validate, validationSchemas } = require('../utils/validation');
const { auditLogger, AUDIT_ACTIONS } = require('../utils/audit-logger');

// Configure multer for file uploads
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
    fileSize: constants.FILES.MAX_SIZE.DOCUMENT
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = [
      ...constants.FILES.ALLOWED_TYPES.PDF,
      ...constants.FILES.ALLOWED_TYPES.DOCUMENT,
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(constants.ERRORS.INVALID_FILE_TYPE), false);
    }
  }
});

// Rate limiting
const rateLimiter = {
  requests: new Map(),
  isAllowed: function(key, maxRequests, windowMs) {
    const now = Date.now();
    const windowStart = now - windowMs;
    
    if (!this.requests.has(key)) {
      this.requests.set(key, []);
    }
    
    const userRequests = this.requests.get(key);
    const validRequests = userRequests.filter(time => time > windowStart);
    this.requests.set(key, validRequests);
    
    if (validRequests.length >= maxRequests) {
      return false;
    }
    
    validRequests.push(now);
    return true;
  }
};

const RATE_LIMITS = {
  UPLOAD: {
    maxRequests: 10,
    windowMs: 60000 // 1 minute
  }
};

// Helper function to clean up temporary files
const cleanupTempFile = (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (error) {
    console.error('Error cleaning up temp file:', error);
  }
};

// Helper function to extract text from different file types
async function extractTextFromFile(file, filePath) {
  let extractedText = '';
  
  try {
    if (file.mimetype === 'text/plain') {
      extractedText = fs.readFileSync(filePath, 'utf8');
    } else if (file.mimetype === 'application/pdf') {
      const dataBuffer = fs.readFileSync(filePath);
      const pdfData = await pdfParse(dataBuffer);
      extractedText = pdfData.text;
    } else if (file.mimetype.includes('wordprocessingml') || file.mimetype.includes('msword')) {
      const result = await mammoth.extractRawText({ path: filePath });
      extractedText = result.value;
    }

    // If extraction failed or resulted in very little text, create a descriptive fallback
    if (!extractedText || extractedText.trim().length < 50) {
      extractedText = `Document: ${file.originalname}

This is a ${file.mimetype.includes('pdf') ? 'PDF' : file.mimetype.includes('word') ? 'Word' : 'document'} file uploaded to the platform.

File Details:
- Original Name: ${file.originalname}
- Type: ${file.mimetype}
- Size: ${Math.round(file.size / 1024)} KB
- Upload Date: ${new Date().toLocaleDateString()}

Note: Text extraction was not successful for this file. For better analysis, please ensure the document contains readable text content.`;
    }
  } catch (extractError) {
    console.error('Text extraction error:', extractError);
    extractedText = `Document: ${file.originalname}

This document has been uploaded but text extraction encountered an error.

File Details:
- Original Name: ${file.originalname}
- Size: ${Math.round(file.size / 1024)} KB
- Upload Date: ${new Date().toLocaleDateString()}

Error during text extraction: ${extractError.message}

Please try re-uploading the document or contact support if the issue persists.`;
  }

  return extractedText;
}

// GET /documents - List documents
router.get('/', async (req, res) => {
  try {
    const { userId, companyWideOnly } = req.query;

    // Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check user profile and status
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.status !== 'approved') {
      return res.status(403).json({ error: 'Account not approved' });
    }

    let query = supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: false });

    if (companyWideOnly === 'true') {
      query = query.eq('is_company_wide', true);
    } else if (userId) {
      query = query.eq('user_id', userId);
    } else if (profile.role !== 'admin') {
      // Non-admin users can only see their own documents and company-wide documents
      query = query.or(`user_id.eq.${user.id},is_company_wide.eq.true`);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Database query error:', error);
      return res.status(500).json({ error: error.message });
    }

    res.json({ documents: data || [] });
  } catch (error) {
    console.error('Documents API error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /documents - Upload document
router.post('/', 
  uploadRateLimit,
  upload.single('file'),
  validateFile,
  validate(validationSchemas.uploadDocument),
  asyncHandler(async (req, res) => {
    logger.info('Document upload API called', { requestId: req.id });

    const { title, isCompanyWide } = req.body;
    const file = req.file;

    logger.info('Upload request data', {
      fileName: file?.originalname,
      fileSize: file?.size,
      fileType: file?.mimetype,
      title,
      isCompanyWide,
      requestId: req.id,
    });

    if (!file || !title) {
      logger.error('Missing file or title', { requestId: req.id });
      return res.status(constants.HTTP_STATUS.BAD_REQUEST).json({ 
        error: 'File and title are required' 
      });
    }

    // Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      cleanupTempFile(file.path);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      console.error('Authentication error:', authError);
      cleanupTempFile(file.path);
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Rate limiting
    const rateLimitKey = `upload:${user.id}`;
    if (!rateLimiter.isAllowed(rateLimitKey, RATE_LIMITS.UPLOAD.maxRequests, RATE_LIMITS.UPLOAD.windowMs)) {
      cleanupTempFile(file.path);
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }

    // Check user profile and status
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, role, email')
      .eq('id', user.id)
      .single();

    if (!profile || profile.status !== 'approved') {
      console.error('User not approved:', profile);
      cleanupTempFile(file.path);
      return res.status(403).json({ error: 'Account not approved' });
    }

    // Extract text content
    const extractedText = await extractTextFromFile(file, file.path);
    console.log('Extracted text length:', extractedText.length);

    // Generate unique file path for storage
    const fileExt = path.extname(file.originalname);
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}${fileExt}`;
    const filePath = `${user.id}/${fileName}`;

    console.log('Uploading to storage path:', filePath);

    // Upload file to Supabase Storage
    const fileBuffer = fs.readFileSync(file.path);
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documents')
      .upload(filePath, fileBuffer, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.mimetype,
      });

    if (uploadError) {
      console.error('Storage upload error:', uploadError);
      cleanupTempFile(file.path);
      return res.status(500).json({ error: uploadError.message });
    }

    console.log('File uploaded successfully:', uploadData);

    // Save document metadata to database
    const { data: document, error: dbError } = await supabase
      .from('documents')
      .insert({
        user_id: user.id,
        title,
        content: extractedText,
        file_path: uploadData.path,
        file_size: file.size,
        file_type: file.mimetype,
        is_company_wide: isCompanyWide === 'true',
      })
      .select()
      .single();

    if (dbError) {
      console.error('Database insert error:', dbError);
      // Clean up uploaded file if database insert fails
      await supabase.storage.from('documents').remove([uploadData.path]);
      cleanupTempFile(file.path);
      return res.status(500).json({ error: dbError.message });
    }

    console.log('Document record created:', document);

    // Clean up temporary file
    cleanupTempFile(file.path);

    res.json({
      success: true,
      document,
      message: 'Document uploaded successfully',
    });
  } catch (error) {
    console.error('Document upload error:', error);
    if (req.file && req.file.path) {
      cleanupTempFile(req.file.path);
    }
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
});

// DELETE /documents/:id - Delete document
router.delete('/:id', async (req, res) => {
  try {
    const { id } = req.params;

    // Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check user profile and status
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.status !== 'approved') {
      return res.status(403).json({ error: 'Account not approved' });
    }

    // Get document info first
    const { data: document, error: fetchError } = await supabase
      .from('documents')
      .select('file_path, user_id')
      .eq('id', id)
      .single();

    if (fetchError || !document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check if user owns the document or is admin
    if (document.user_id !== user.id && profile.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    // Delete from storage
    const { error: storageError } = await supabase.storage
      .from('documents')
      .remove([document.file_path]);

    if (storageError) {
      console.error('Storage deletion error:', storageError);
    }

    // Delete from database
    const { error: dbError } = await supabase
      .from('documents')
      .delete()
      .eq('id', id);

    if (dbError) {
      return res.status(500).json({ error: dbError.message });
    }

    res.json({ success: true, message: 'Document deleted successfully' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /documents/url - Get signed URL for document
router.post('/url', async (req, res) => {
  try {
    const { filePath } = req.body;

    if (!filePath) {
      return res.status(400).json({ error: 'File path is required' });
    }

    // Authentication
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Check user profile and status
    const { data: profile } = await supabase
      .from('profiles')
      .select('status, role')
      .eq('id', user.id)
      .single();

    if (!profile || profile.status !== 'approved') {
      return res.status(403).json({ error: 'Account not approved' });
    }

    // Verify user has access to this document
    const { data: document, error: docError } = await supabase
      .from('documents')
      .select('user_id, is_company_wide')
      .eq('file_path', filePath)
      .single();

    if (docError || !document) {
      return res.status(404).json({ error: 'Document not found' });
    }

    // Check access permissions
    const hasAccess = 
      document.user_id === user.id || 
      document.is_company_wide || 
      profile.role === 'admin';

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied' });
    }

    const { data } = await supabase.storage
      .from('documents')
      .createSignedUrl(filePath, 3600); // 1 hour expiry

    if (!data?.signedUrl) {
      return res.status(500).json({ error: 'Failed to generate URL' });
    }

    res.json({ url: data.signedUrl });
  } catch (error) {
    console.error('Get document URL error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;