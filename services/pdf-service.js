const fs = require('fs');
const pdfParse = require('pdf-parse');

class PDFService {
  async extractText(filePath) {
    const startTime = Date.now();
    
    try {
      // Read the PDF file
      const dataBuffer = fs.readFileSync(filePath);
      
      // Parse the PDF
      const data = await pdfParse(dataBuffer);
      
      const processingTime = Date.now() - startTime;
      
      console.log(`PDF processed successfully: ${data.numpages} pages, ${data.text.length} characters`);
      
      return {
        text: data.text.trim(),
        metadata: {
          pages: data.numpages,
          info: data.info
        },
        processingTime: `${processingTime}ms`
      };
    } catch (error) {
      console.error('PDF extraction error:', error);
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
  }

  // Health check for PDF service
  isHealthy() {
    return {
      service: 'pdf',
      status: 'healthy',
      capabilities: ['text extraction', 'metadata parsing']
    };
  }
}

module.exports = new PDFService();