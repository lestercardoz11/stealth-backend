class ResponseFormatter {
  static success(data, message = 'Operation successful') {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString()
    };
  }

  static error(error, statusCode = 500) {
    return {
      success: false,
      error: {
        code: statusCode,
        message: error.message || 'An error occurred',
        details: process.env.NODE_ENV === 'development' ? error.stack : undefined
      },
      timestamp: new Date().toISOString()
    };
  }

  static extractionResult(result, filename, fileType, fileSize) {
    const wordCount = result.text ? 
      result.text.split(/\s+/).filter(word => word.length > 0).length : 0;

    return {
      success: true,
      filename,
      fileInfo: {
        type: fileType,
        size: fileSize,
        sizeFormatted: this.formatBytes(fileSize)
      },
      extraction: {
        text: result.text,
        wordCount,
        characterCount: result.text ? result.text.length : 0,
        processingTime: result.processingTime,
        metadata: result.metadata || {}
      },
      timestamp: new Date().toISOString()
    };
  }

  static formatBytes(bytes, decimals = 2) {
    if (bytes === 0) return '0 Bytes';

    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];

    const i = Math.floor(Math.log(bytes) / Math.log(k));

    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  static healthCheck(services = {}) {
    return {
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      services,
      uptime: process.uptime()
    };
  }
}

module.exports = ResponseFormatter;