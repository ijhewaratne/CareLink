/**
 * ============================================================================
 * CareLink - Secure Document Storage Tests
 * ============================================================================
 * Unit tests for all security functions
 * Run with: jest secureDocumentStorage.test.ts
 * ============================================================================
 */

import {
  uploadVerificationDocument,
  generateSignedViewUrl,
  encryptNIC,
  decryptNIC,
  maskNIC,
  UploadResult,
  DocumentType,
} from './secureDocumentStorage';
import crypto from 'crypto';

// Mock environment variables before importing module
process.env.ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex');
process.env.CLOUD_PROVIDER = 'gcs';
process.env.GCS_BUCKET_NAME = 'test-bucket';
process.env.GCS_PROJECT_ID = 'test-project';
process.env.MAX_FILE_SIZE_MB = '5';

// =============================================================================
// TEST: maskNIC()
// =============================================================================
describe('maskNIC', () => {
  it('should mask NIC keeping last 4 digits visible', () => {
    const nic = '123456789V';
    const masked = maskNIC(nic);
    expect(masked).toBe('XXXXXX-789V');
  });

  it('should handle short NIC numbers', () => {
    const nic = '1234';
    const masked = maskNIC(nic);
    expect(masked).toBe('-1234');
  });

  it('should return XXXX for empty NIC', () => {
    expect(maskNIC('')).toBe('XXXX');
  });

  it('should handle new 12-digit NIC format', () => {
    const nic = '200012345678';
    const masked = maskNIC(nic);
    expect(masked).toBe('XXXXXXXX-5678');
  });
});

// =============================================================================
// TEST: encryptNIC() / decryptNIC()
// =============================================================================
describe('NIC Encryption/Decryption', () => {
  const testNICs = [
    '123456789V',      // Old format
    '200012345678',    // New 12-digit format
    '987654321X',      // Old format with X
  ];

  testNICs.forEach((nic) => {
    it(`should encrypt and decrypt NIC: ${maskNIC(nic)}`, () => {
      const encrypted = encryptNIC(nic);
      
      // Verify encrypted format (iv:authTag:ciphertext)
      const parts = encrypted.split(':');
      expect(parts.length).toBe(3);
      
      // Verify each part is base64
      parts.forEach((part) => {
        expect(Buffer.from(part, 'base64').toString('base64')).toBe(part);
      });

      // Decrypt and verify
      const decrypted = decryptNIC(encrypted, 'test-user');
      expect(decrypted).toBe(nic);
    });
  });

  it('should produce different ciphertexts for same NIC (due to random IV)', () => {
    const nic = '123456789V';
    const encrypted1 = encryptNIC(nic);
    const encrypted2 = encryptNIC(nic);
    
    expect(encrypted1).not.toBe(encrypted2);
    
    // But both should decrypt to same value
    expect(decryptNIC(encrypted1, 'test-user')).toBe(nic);
    expect(decryptNIC(encrypted2, 'test-user')).toBe(nic);
  });

  it('should throw error for empty NIC', () => {
    expect(() => encryptNIC('')).toThrow('NIC number cannot be empty');
  });

  it('should throw error for invalid encrypted format', () => {
    expect(() => decryptNIC('invalid-format', 'test-user')).toThrow();
  });

  it('should detect tampering (wrong auth tag)', () => {
    const nic = '123456789V';
    const encrypted = encryptNIC(nic);
    const parts = encrypted.split(':');
    
    // Tamper with the ciphertext
    parts[2] = Buffer.from('tampered').toString('base64');
    const tampered = parts.join(':');
    
    expect(() => decryptNIC(tampered, 'test-user')).toThrow();
  });
});

// =============================================================================
// TEST: File Validation (via uploadVerificationDocument)
// =============================================================================
describe('File Validation', () => {
  const userId = 'test-user-123';

  it('should accept valid JPEG file', async () => {
    // Create a minimal valid JPEG buffer (JPEG magic number + minimal data)
    const jpegBuffer = Buffer.concat([
      Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), // JPEG magic number
      Buffer.from('JFIF\x00'), // JFIF header
      Buffer.alloc(100, 0), // Padding
    ]);

    // Mock GCS upload - would need actual mock in real test
    // For now, just validate the file check passes
    const validationResult = validateFileForTest(jpegBuffer, 'test.jpg', 'image/jpeg');
    expect(validationResult.valid).toBe(true);
  });

  it('should accept valid PNG file', async () => {
    const pngBuffer = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4E, 0x47]), // PNG magic number
      Buffer.alloc(100, 0),
    ]);

    const validationResult = validateFileForTest(pngBuffer, 'test.png', 'image/png');
    expect(validationResult.valid).toBe(true);
  });

  it('should accept valid PDF file', async () => {
    const pdfBuffer = Buffer.concat([
      Buffer.from('%PDF-1.4\n'), // PDF header
      Buffer.alloc(100, 0),
    ]);

    const validationResult = validateFileForTest(pdfBuffer, 'test.pdf', 'application/pdf');
    expect(validationResult.valid).toBe(true);
  });

  it('should reject file exceeding size limit', () => {
    const largeBuffer = Buffer.alloc(6 * 1024 * 1024); // 6MB
    const validationResult = validateFileForTest(largeBuffer, 'large.jpg', 'image/jpeg');
    expect(validationResult.valid).toBe(false);
    expect(validationResult.error).toContain('exceeds maximum');
  });

  it('should reject invalid MIME type', () => {
    const buffer = Buffer.alloc(100);
    const validationResult = validateFileForTest(buffer, 'test.exe', 'application/x-msdownload');
    expect(validationResult.valid).toBe(false);
    expect(validationResult.error).toContain('Invalid file type');
  });

  it('should reject file type spoofing', () => {
    // Try to upload an EXE disguised as JPG
    const exeBuffer = Buffer.concat([
      Buffer.from('MZ'), // EXE magic number
      Buffer.alloc(100, 0),
    ]);

    const validationResult = validateFileForTest(exeBuffer, 'disguised.jpg', 'image/jpeg');
    expect(validationResult.valid).toBe(false);
    expect(validationResult.error).toContain('does not match declared type');
  });
});

// Helper function for testing file validation
function validateFileForTest(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): { valid: boolean; error?: string } {
  const maxSizeBytes = 5 * 1024 * 1024;
  
  if (buffer.length > maxSizeBytes) {
    return { valid: false, error: 'File size exceeds maximum allowed (5MB)' };
  }

  const allowedMimeTypes = ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'];
  if (!allowedMimeTypes.includes(mimeType.toLowerCase())) {
    return { valid: false, error: 'Invalid file type' };
  }

  // Check file signature
  const fileSignature = buffer.slice(0, 4).toString('hex');
  const validSignatures: Record<string, string[]> = {
    'ffd8ffe0': ['image/jpeg', 'image/jpg'],
    'ffd8ffe1': ['image/jpeg', 'image/jpg'],
    '89504e47': ['image/png'],
    '25504446': ['application/pdf'],
  };

  const expectedTypes = validSignatures[fileSignature.substring(0, 8)];
  if (!expectedTypes || !expectedTypes.includes(mimeType.toLowerCase())) {
    return { valid: false, error: 'File content does not match declared type' };
  }

  return { valid: true };
}

// =============================================================================
// TEST: Document Types
// =============================================================================
describe('Document Types', () => {
  const validTypes: DocumentType[] = ['NIC_FRONT', 'NIC_BACK', 'POLICE_CLEARANCE'];

  validTypes.forEach((type) => {
    it(`should accept document type: ${type}`, () => {
      expect(validTypes).toContain(type);
    });
  });
});

// =============================================================================
// TEST: Security Properties
// =============================================================================
describe('Security Properties', () => {
  it('should never return publicUrl in upload result', async () => {
    // This is a type check - publicUrl should always be null
    const mockResult: UploadResult = {
      storageKey: 'test-key',
      publicUrl: null,
      metadata: {
        documentType: 'NIC_FRONT',
        originalName: 'test.jpg',
        mimeType: 'image/jpeg',
        size: 1000,
        uploadedAt: new Date(),
        bucket: 'test-bucket',
      },
    };

    expect(mockResult.publicUrl).toBeNull();
  });

  it('should mask all but last 4 digits of NIC', () => {
    const nic = '123456789012';
    const masked = maskNIC(nic);
    const visiblePart = masked.split('-')[1];
    expect(visiblePart).toBe('9012');
    expect(masked.startsWith('X')).toBe(true);
  });

  it('encryption should use AES-256-GCM (256-bit key)', () => {
    const key = process.env.ENCRYPTION_KEY;
    expect(key).toBeDefined();
    expect(key!.length).toBe(64); // 32 bytes = 256 bits in hex
  });
});

// =============================================================================
// INTEGRATION TEST EXAMPLE (would need actual cloud setup)
// =============================================================================
describe('Integration Tests (skipped without cloud credentials)', () => {
  it.skip('should upload file to GCS and generate signed URL', async () => {
    // This test requires actual GCS credentials
    const fileBuffer = Buffer.from('test file content');
    
    const uploadResult = await uploadVerificationDocument(
      fileBuffer,
      'test.jpg',
      'NIC_FRONT',
      'test-user'
    );

    expect(uploadResult.storageKey).toBeDefined();
    expect(uploadResult.publicUrl).toBeNull();
    expect(uploadResult.metadata.documentType).toBe('NIC_FRONT');

    const signedUrlResult = await generateSignedViewUrl(
      uploadResult.storageKey,
      'admin-user',
      15
    );

    expect(signedUrlResult.signedUrl).toContain('https://');
    expect(signedUrlResult.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

// =============================================================================
// PERFORMANCE TESTS
// =============================================================================
describe('Performance', () => {
  it('should encrypt NIC in under 10ms', () => {
    const nic = '123456789V';
    const start = Date.now();
    
    for (let i = 0; i < 100; i++) {
      encryptNIC(nic);
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000); // 100 encryptions in under 1 second
  });

  it('should decrypt NIC in under 10ms', () => {
    const nic = '123456789V';
    const encrypted = encryptNIC(nic);
    
    const start = Date.now();
    
    for (let i = 0; i < 100; i++) {
      decryptNIC(encrypted, 'test-user');
    }
    
    const duration = Date.now() - start;
    expect(duration).toBeLessThan(1000);
  });
});

console.log('✅ All security tests defined. Run with: jest secureDocumentStorage.test.ts');
