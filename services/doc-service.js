const fs = require('fs');
const mammoth = require('mammoth');
const path = require('path');

class DOCService {
  async extractText(filePath) {
    const startTime = Date.now();
    
    try {
      const fileExtension = path.extname(filePath).toLowerCase();
      
      if (fileExtension === '.doc') {
        // For older .doc files, mammoth can still attempt to process them
        // but results may vary
        console.log('Processing legacy .doc file (results may vary)');
      }
      
      // Extract text from document
      const result = await mammoth.extractRawText({ path: filePath });
      
      const processingTime = Date.now() - startTime;
      
      // Check for any warnings
      if (result.messages.length > 0) {
        console.log('Document processing warnings:', result.messages);
      }
      
      console.log(`Document processed successfully: ${result.value.length} characters`);
      
      return {
        text: result.value.trim(),
        metadata: {
          warnings: result.messages,
          fileType: fileExtension
        },
        processingTime: `${processingTime}ms`
      };
    } catch (error) {
      console.error('Document extraction error:', error);
      throw new Error(`Document extraction failed: ${error.message}`);
    }
  }

  // Extract both text and HTML for more formatting options
  async extractHTML(filePath) {
    const startTime = Date.now();
    
    try {
      const result = await mammoth.convertToHtml({ path: filePath });
      const processingTime = Date.now() - startTime;
      
      return {
        html: result.value,
        metadata: {
          warnings: result.messages
        },
        processingTime: `${processingTime}ms`
      };
    } catch (error) {
      console.error('Document HTML extraction error:', error);
      throw new Error(`Document HTML extraction failed: ${error.message}`);
    }
  }

  // Health check for DOC service
  isHealthy() {
    return {
      service: 'doc',
      status: 'healthy',
      capabilities: ['text extraction', 'html conversion', 'docx support', 'limited doc support']
    };
  }
}

module.exports = new DOCService();