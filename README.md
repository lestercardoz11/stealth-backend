# Text Extraction Microservices API

A Node.js microservices backend that extracts text from PDF files, DOC/DOCX documents, and images using OCR technology. Files are stored securely in Supabase Storage.

## Features

- **PDF Text Extraction**: Extract text from PDF documents with metadata
- **Document Processing**: Extract text from DOC and DOCX files
- **OCR Support**: Extract text from images using Tesseract.js
- **Multi-language OCR**: Support for multiple languages
- **Cloud Storage**: Secure file storage using Supabase Storage
- **File Validation**: Comprehensive file type and size validation
- **Error Handling**: Robust error handling and logging
- **RESTful API**: Clean API endpoints with JSON responses

## Supported File Types

- **PDF**: `.pdf`
- **Documents**: `.doc`, `.docx`
- **Images**: `.png`, `.jpg`, `.jpeg`, `.gif`, `.bmp`, `.tiff`

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd microservices-text-extractor
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   ```bash
   cp .env.example .env
   ```
   
   Edit `.env` and add your Supabase credentials:
   ```
   SUPABASE_URL=your_supabase_project_url
   SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
   ```
4. Start the server:
   ```bash
   npm start
   ```

   For development with auto-restart:
   ```bash
   npm run dev
   ```

## API Endpoints

### GET /
Get API information and available endpoints.

### GET /health
Health check endpoint that returns the status of all services.

### GET /supported-formats
List all supported file formats.

### POST /extract
Extract text from an uploaded file.

**Request:**
- Method: `POST`
- Content-Type: `multipart/form-data`
- Body: File upload with field name `file`

**Response:**
```json
{
  "success": true,
  "filename": "document.pdf",
  "fileType": "application/pdf",
  "fileSize": 1024000,
  "storageInfo": {
    "path": "1234567890-123456789.pdf",
    "fileName": "1234567890-123456789.pdf"
  },
  "extractedText": "Extracted text content...",
  "wordCount": 150,
  "processingTime": "1200ms",
  "timestamp": "2023-12-07T10:30:00.000Z"
}
```

## Usage Examples

### Using cURL

Extract text from a PDF:
```bash
curl -X POST \
  http://localhost:3000/extract \
  -F "file=@/path/to/your/document.pdf"
```

Extract text from an image:
```bash
curl -X POST \
  http://localhost:3000/extract \
  -F "file=@/path/to/your/image.png"
```

### Using JavaScript (Frontend)

```javascript
const formData = new FormData();
formData.append('file', fileInput.files[0]);

const response = await fetch('http://localhost:3000/extract', {
  method: 'POST',
  body: formData
});

const result = await response.json();
console.log('Extracted text:', result.extractedText);
```

## Configuration

### Environment Variables
- `SUPABASE_URL`: Your Supabase project URL
- `SUPABASE_SERVICE_ROLE_KEY`: Your Supabase service role key (for server-side operations)
- `PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)

### Supabase Storage
The application automatically creates a `document-uploads` bucket in your Supabase Storage with:
- Private access (files are not publicly accessible)
- 10MB file size limit
- Restricted to supported MIME types

### File Size Limits
- PDF files: 10MB maximum
- Document files: 5MB maximum  
- Image files: 8MB maximum

### OCR Languages
The OCR service supports multiple languages including:
- English (`eng`)
- Spanish (`spa`)
- French (`fra`)
- German (`deu`)
- Italian (`ita`)
- Portuguese (`por`)
- Russian (`rus`)
- Chinese Simplified (`chi_sim`)
- Chinese Traditional (`chi_tra`)
- Japanese (`jpn`)
- Arabic (`ara`)

## Architecture

The application follows a microservices architecture:

- **Main Server** (`app.js`): Handles routing, file uploads, and coordinates services
- **Storage Service** (`services/storage-service.js`): Manages Supabase Storage operations
- **PDF Service** (`services/pdf-service.js`): Processes PDF files
- **DOC Service** (`services/doc-service.js`): Processes DOC/DOCX files  
- **OCR Service** (`services/ocr-service.js`): Processes images using OCR
- **Utilities**: File validation and response formatting

## Error Handling

The API provides comprehensive error handling:

- File validation errors (unsupported types, size limits)
- Processing errors (corrupted files, extraction failures)
- Server errors with detailed messages
- Automatic file cleanup on errors

## Security Features

- File type validation based on MIME type and extension
- File size limits to prevent abuse
- Secure cloud storage with Supabase
- Automatic cleanup of temporary files
- Private storage bucket (files not publicly accessible)
- CORS support for cross-origin requests

## Performance

- Memory-efficient file processing
- Cloud-based storage eliminates local disk space concerns
- Automatic cleanup of temporary processing files
- Processing time tracking for monitoring
- Confidence filtering for OCR results

## Development

To add support for new file types:

1. Create a new service in the `services/` directory
2. Implement the `extractText()` method
3. Add the MIME type to the file validator
4. Update the main router to handle the new type

## License

MIT License