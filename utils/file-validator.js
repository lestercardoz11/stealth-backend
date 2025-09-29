const path = require('path');

class FileValidator {
  constructor() {
    this.supportedTypes = {
      pdf: ['application/pdf'],
      document: [
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ],
      image: [
        'image/png',
        'image/jpeg',
        'image/jpg',
        'image/gif',
        'image/bmp',
        'image/tiff'
      ]
    };

    this.maxFileSizes = {
      pdf: 10 * 1024 * 1024,      // 10MB
      document: 5 * 1024 * 1024,  // 5MB
      image: 8 * 1024 * 1024      // 8MB
    };
  }

  validateFile(file) {
    const errors = [];

    // Check if file exists
    if (!file) {
      errors.push('No file provided');
      return { isValid: false, errors };
    }

    // Check file type
    const fileType = this.getFileType(file.mimetype);
    if (!fileType) {
      errors.push(`Unsupported file type: ${file.mimetype}`);
    }

    // Check file size
    if (fileType && file.size > this.maxFileSizes[fileType]) {
      const maxSizeMB = (this.maxFileSizes[fileType] / (1024 * 1024)).toFixed(1);
      errors.push(`File too large. Maximum size for ${fileType} files is ${maxSizeMB}MB`);
    }

    // Check file extension matches mimetype
    const extension = path.extname(file.originalname).toLowerCase();
    if (!this.isExtensionValid(extension, file.mimetype)) {
      errors.push(`File extension ${extension} doesn't match the file type`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      fileType
    };
  }

  getFileType(mimetype) {
    for (const [type, mimeTypes] of Object.entries(this.supportedTypes)) {
      if (mimeTypes.includes(mimetype)) {
        return type;
      }
    }
    return null;
  }

  isExtensionValid(extension, mimetype) {
    const validExtensions = {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'image/png': ['.png'],
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/jpg': ['.jpg', '.jpeg'],
      'image/gif': ['.gif'],
      'image/bmp': ['.bmp'],
      'image/tiff': ['.tiff', '.tif']
    };

    const allowedExtensions = validExtensions[mimetype] || [];
    return allowedExtensions.includes(extension);
  }

  getAllSupportedTypes() {
    return this.supportedTypes;
  }

  getMaxFileSizes() {
    return this.maxFileSizes;
  }
}

module.exports = new FileValidator();