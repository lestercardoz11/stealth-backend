const supabase = require('../config/supabase');
const fs = require('fs');
const path = require('path');

class StorageService {
  constructor() {
    this.bucketName = 'documents';
  }

  // Initialize storage bucket if it doesn't exist
  async initializeBucket() {
    try {
      const { data: buckets, error } = await supabase.storage.listBuckets();
      
      if (error) {
        console.error('Error listing buckets:', error);
        return false;
      }

      const bucketExists = buckets.some(bucket => bucket.name === this.bucketName);
      
      if (!bucketExists) {
        const { data, error: createError } = await supabase.storage.createBucket(this.bucketName, {
          public: false,
          allowedMimeTypes: [
            'application/pdf',
            'application/msword',
            'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            'image/png',
            'image/jpeg',
            'image/jpg',
            'image/gif',
            'image/bmp',
            'image/tiff'
          ],
          fileSizeLimit: 10485760 // 10MB
        });

        if (createError) {
          console.error('Error creating bucket:', createError);
          return false;
        }

        console.log(`✅ Created storage bucket: ${this.bucketName}`);
      }

      return true;
    } catch (error) {
      console.error('Error initializing bucket:', error);
      return false;
    }
  }

  // Upload file to Supabase Storage
  async uploadFile(filePath, originalName, mimetype) {
    try {
      // Generate unique filename
      const timestamp = Date.now();
      const randomSuffix = Math.round(Math.random() * 1E9);
      const fileExtension = path.extname(originalName);
      const fileName = `${timestamp}-${randomSuffix}${fileExtension}`;
      
      // Read file buffer
      const fileBuffer = fs.readFileSync(filePath);
      
      // Upload to Supabase Storage
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .upload(fileName, fileBuffer, {
          contentType: mimetype,
          duplex: 'half'
        });

      if (error) {
        throw new Error(`Upload failed: ${error.message}`);
      }

      console.log(`✅ File uploaded to Supabase Storage: ${fileName}`);
      
      return {
        path: data.path,
        fileName: fileName,
        fullPath: data.fullPath
      };
    } catch (error) {
      console.error('Storage upload error:', error);
      throw error;
    }
  }

  // Download file from Supabase Storage to temporary location
  async downloadFile(storagePath) {
    try {
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .download(storagePath);

      if (error) {
        throw new Error(`Download failed: ${error.message}`);
      }

      // Create temporary file
      const tempDir = path.join(__dirname, '../temp');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const tempFileName = `temp-${Date.now()}-${path.basename(storagePath)}`;
      const tempFilePath = path.join(tempDir, tempFileName);

      // Convert blob to buffer and write to temp file
      const arrayBuffer = await data.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      fs.writeFileSync(tempFilePath, buffer);

      console.log(`📥 File downloaded to temp location: ${tempFilePath}`);
      
      return tempFilePath;
    } catch (error) {
      console.error('Storage download error:', error);
      throw error;
    }
  }

  // Delete file from Supabase Storage
  async deleteFile(storagePath) {
    try {
      const { error } = await supabase.storage
        .from(this.bucketName)
        .remove([storagePath]);

      if (error) {
        console.error('Error deleting file from storage:', error);
        return false;
      }

      console.log(`🗑️ File deleted from storage: ${storagePath}`);
      return true;
    } catch (error) {
      console.error('Storage deletion error:', error);
      return false;
    }
  }

  // Get signed URL for file access
  async getSignedUrl(storagePath, expiresIn = 3600) {
    try {
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .createSignedUrl(storagePath, expiresIn);

      if (error) {
        throw new Error(`Failed to create signed URL: ${error.message}`);
      }

      return data.signedUrl;
    } catch (error) {
      console.error('Error creating signed URL:', error);
      throw error;
    }
  }

  // Clean up temporary files
  cleanupTempFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        console.log(`🧹 Cleaned up temp file: ${filePath}`);
      }
    } catch (error) {
      console.error('Error cleaning up temp file:', error);
    }
  }

  // List files in storage (for admin purposes)
  async listFiles(limit = 100, offset = 0) {
    try {
      const { data, error } = await supabase.storage
        .from(this.bucketName)
        .list('', {
          limit,
          offset,
          sortBy: { column: 'created_at', order: 'desc' }
        });

      if (error) {
        throw new Error(`Failed to list files: ${error.message}`);
      }

      return data;
    } catch (error) {
      console.error('Error listing files:', error);
      throw error;
    }
  }
}

module.exports = new StorageService();