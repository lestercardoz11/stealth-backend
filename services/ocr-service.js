const fs = require('fs');
const Tesseract = require('tesseract.js');

class OCRService {
  constructor() {
    // Initialize with default options
    this.defaultOptions = {
      logger: m => {
        if (m.status === 'recognizing text') {
          console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
        }
      }
    };
  }

  async extractText(filePath, language = 'eng') {
    const startTime = Date.now();
    
    try {
      console.log(`Starting OCR processing for image: ${filePath}`);
      
      // Perform OCR on the image
      const { data } = await Tesseract.recognize(
        filePath,
        language,
        this.defaultOptions
      );
      
      const processingTime = Date.now() - startTime;
      
      // Filter out low-confidence text (optional)
      const filteredText = this.filterLowConfidenceText(data);
      
      console.log(`OCR completed: ${data.text.length} characters, confidence: ${data.confidence}%`);
      
      return {
        text: filteredText || data.text.trim(),
        metadata: {
          confidence: Math.round(data.confidence),
          language: language,
          blocks: data.blocks?.length || 0,
          paragraphs: data.paragraphs?.length || 0,
          lines: data.lines?.length || 0,
          words: data.words?.length || 0,
          symbols: data.symbols?.length || 0
        },
        processingTime: `${processingTime}ms`
      };
    } catch (error) {
      console.error('OCR extraction error:', error);
      throw new Error(`OCR extraction failed: ${error.message}`);
    }
  }

  // Extract text with multiple languages
  async extractTextMultiLanguage(filePath, languages = ['eng']) {
    const startTime = Date.now();
    
    try {
      const languageString = languages.join('+');
      console.log(`Starting multi-language OCR: ${languageString}`);
      
      const { data } = await Tesseract.recognize(
        filePath,
        languageString,
        this.defaultOptions
      );
      
      const processingTime = Date.now() - startTime;
      
      return {
        text: data.text.trim(),
        metadata: {
          confidence: Math.round(data.confidence),
          languages: languages,
          detectedLanguages: this.detectLanguages(data),
          words: data.words?.length || 0
        },
        processingTime: `${processingTime}ms`
      };
    } catch (error) {
      console.error('Multi-language OCR error:', error);
      throw new Error(`Multi-language OCR failed: ${error.message}`);
    }
  }

  // Filter out text with very low confidence
  filterLowConfidenceText(data, minConfidence = 30) {
    if (!data.words) return data.text;
    
    const filteredWords = data.words
      .filter(word => word.confidence >= minConfidence)
      .map(word => word.text)
      .join(' ');
    
    return filteredWords || data.text;
  }

  // Detect languages from OCR data
  detectLanguages(data) {
    // This is a simplified language detection
    // In production, you might want to use a proper language detection library
    const languages = [];
    
    if (data.words) {
      const hasLatinScript = /[a-zA-Z]/.test(data.text);
      const hasCyrillic = /[\u0400-\u04FF]/.test(data.text);
      const hasArabic = /[\u0600-\u06FF]/.test(data.text);
      const hasChinese = /[\u4e00-\u9fff]/.test(data.text);
      
      if (hasLatinScript) languages.push('latin-based');
      if (hasCyrillic) languages.push('cyrillic');
      if (hasArabic) languages.push('arabic');
      if (hasChinese) languages.push('chinese');
    }
    
    return languages.length > 0 ? languages : ['unknown'];
  }

  // Health check for OCR service
  isHealthy() {
    return {
      service: 'ocr',
      status: 'healthy',
      capabilities: [
        'image text extraction',
        'multi-language support',
        'confidence filtering',
        'layout analysis'
      ],
      supportedLanguages: [
        'eng', 'spa', 'fra', 'deu', 'ita', 'por', 'rus', 'chi_sim', 'chi_tra', 'jpn', 'ara'
      ]
    };
  }
}

module.exports = new OCRService();