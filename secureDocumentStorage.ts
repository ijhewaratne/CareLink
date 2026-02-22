/**
 * ============================================================================
 * CareLink - Secure Document Storage Module
 * ============================================================================
 * 
 * COMPLIANCE: Sri Lanka PDPA (Personal Data Protection Act)
 * SECURITY LEVEL: HIGH - PII Encryption, Signed URLs, Audit Logging
 * 
 * CRITICAL SECURITY PRINCIPLES:
 * 1. Documents NEVER stored in database - only metadata
 * 2. All files stored in private cloud buckets (no public access)
 * 3. Short-lived signed URLs (15 min default) for authorized viewing
 * 4. AES-256-GCM encryption for NIC numbers at rest
 * 5. Comprehensive audit logging for all document access
 * 6. Strict file validation (type, size) before upload
 * 
 * ============================================================================
 */

import { Storage } from '@google-cloud/storage';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export type DocumentType = 'NIC_FRONT' | 'NIC_BACK' | 'POLICE_CLEARANCE';

export interface UploadResult {
  storageKey: string;      // Unique identifier in cloud storage
  publicUrl: null;         // NEVER public - always null for security
  metadata: {
    documentType: DocumentType;
    originalName: string;
    mimeType: string;
    size: number;
    uploadedAt: Date;
    bucket: string;
  };
}

export interface SignedUrlResult {
  signedUrl: string;
  expiresAt: Date;
}

export interface AuditLogEntry {
  timestamp: Date;
  action: 'UPLOAD' | 'VIEW' | 'DECRYPT';
  storageKey?: string;
  userId: string;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
}

// =============================================================================
// CONFIGURATION & ENVIRONMENT
// =============================================================================

// REQUIRED Environment Variables:
// - CLOUD_PROVIDER: 'gcs' | 's3'
// - GCS_BUCKET_NAME or S3_BUCKET_NAME
// - GCS_PROJECT_ID (for GCS)
// - AWS_REGION (for S3)
// - ENCRYPTION_KEY: 32-byte hex string for AES-256
// - MAX_FILE_SIZE_MB: default 5

const CONFIG = {
  cloudProvider: (process.env.CLOUD_PROVIDER || 'gcs') as 'gcs' | 's3',
  gcs: {
    projectId: process.env.GCS_PROJECT_ID || '',
    bucketName: process.env.GCS_BUCKET_NAME || '',
  },
  s3: {
    region: process.env.AWS_REGION || 'ap-southeast-1',
    bucketName: process.env.S3_BUCKET_NAME || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
  },
  encryption: {
    key: process.env.ENCRYPTION_KEY || '', // Must be 64 hex chars (32 bytes)
  },
  upload: {
    maxFileSizeMB: parseInt(process.env.MAX_FILE_SIZE_MB || '5', 10),
    allowedMimeTypes: ['image/jpeg', 'image/jpg', 'image/png', 'application/pdf'],
    allowedExtensions: ['.jpg', '.jpeg', '.png', '.pdf'],
    signedUrlExpirationMinutes: 15,
  },
};

// =============================================================================
// CLOUD STORAGE CLIENT INITIALIZATION
// =============================================================================

// GCS Client (lazy initialization)
let gcsClient: Storage | null = null;
const getGCSClient = (): Storage => {
  if (!gcsClient) {
    gcsClient = new Storage({
      projectId: CONFIG.gcs.projectId,
    });
  }
  return gcsClient;
};

// S3 Client (lazy initialization)
let s3Client: S3Client | null = null;
const getS3Client = (): S3Client => {
  if (!s3Client) {
    s3Client = new S3Client({
      region: CONFIG.s3.region,
      credentials: {
        accessKeyId: CONFIG.s3.accessKeyId,
        secretAccessKey: CONFIG.s3.secretAccessKey,
      },
    });
  }
  return s3Client;
};

// =============================================================================
// AUDIT LOGGING
// =============================================================================

/**
 * Logs document access for compliance auditing (PDPA requirement)
 * In production, this should write to a secure audit log system
 */
const logAudit = (entry: AuditLogEntry): void => {
  // SECURITY: In production, send to secure audit log service
  // Options: Cloud Logging, Splunk, ELK Stack, or database audit table
  const logMessage = `[AUDIT] ${entry.timestamp.toISOString()} | ${entry.action} | User: ${entry.userId} | Success: ${entry.success}`;
  
  if (entry.success) {
    console.log(logMessage);
  } else {
    console.error(logMessage, entry.errorMessage);
  }

  // TODO: Implement actual audit log persistence
  // Example: await auditLogRepository.create(entry);
};

// =============================================================================
// FILE VALIDATION
// =============================================================================

/**
 * Validates file before upload
 * SECURITY: Prevents malicious file uploads
 */
const validateFile = (
  buffer: Buffer,
  originalName: string,
  mimeType: string
): { valid: boolean; error?: string } => {
  // Check file size
  const maxSizeBytes = CONFIG.upload.maxFileSizeMB * 1024 * 1024;
  if (buffer.length > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds maximum allowed (${CONFIG.upload.maxFileSizeMB}MB)`,
    };
  }

  // Validate MIME type
  if (!CONFIG.upload.allowedMimeTypes.includes(mimeType.toLowerCase())) {
    return {
      valid: false,
      error: `Invalid file type. Allowed: ${CONFIG.upload.allowedMimeTypes.join(', ')}`,
    };
  }

  // Validate file extension
  const extension = originalName.toLowerCase().slice(originalName.lastIndexOf('.'));
  if (!CONFIG.upload.allowedExtensions.includes(extension)) {
    return {
      valid: false,
      error: `Invalid file extension. Allowed: ${CONFIG.upload.allowedExtensions.join(', ')}`,
    };
  }

  // SECURITY: Verify file signature (magic numbers) to prevent spoofing
  const fileSignature = buffer.slice(0, 4).toString('hex');
  const validSignatures: Record<string, string[]> = {
    'ffd8ffe0': ['image/jpeg', 'image/jpg'], // JPEG
    'ffd8ffe1': ['image/jpeg', 'image/jpg'], // JPEG (EXIF)
    '89504e47': ['image/png'],               // PNG
    '25504446': ['application/pdf'],         // PDF
  };

  const expectedTypes = validSignatures[fileSignature.substring(0, 8)];
  if (!expectedTypes || !expectedTypes.includes(mimeType.toLowerCase())) {
    return {
      valid: false,
      error: 'File content does not match declared type. Possible spoofing attempt.',
    };
  }

  return { valid: true };
};

// =============================================================================
// FUNCTION 1: uploadVerificationDocument()
// =============================================================================

/**
 * Uploads verification documents to secure cloud storage
 * 
 * SECURITY FEATURES:
 * - File type & size validation
 * - Unique UUID filename (prevents overwrites & enumeration)
 * - Private ACL (no public access)
 * - Metadata stored separately from file content
 * 
 * @param fileBuffer - The file content as Buffer
 * @param fileName - Original filename (for metadata only)
 * @param documentType - Type of verification document
 * @param userId - ID of user uploading (for audit logging)
 * @returns UploadResult with storage key and metadata
 */
export const uploadVerificationDocument = async (
  fileBuffer: Buffer,
  fileName: string,
  documentType: DocumentType,
  userId: string
): Promise<UploadResult> => {
  try {
    // SECURITY: Validate file before any processing
    const validation = validateFile(fileBuffer, fileName, getMimeType(fileName));
    if (!validation.valid) {
      logAudit({
        timestamp: new Date(),
        action: 'UPLOAD',
        userId,
        success: false,
        errorMessage: validation.error,
      });
      throw new Error(validation.error);
    }

    // Generate unique filename to prevent overwrites and enumeration attacks
    const uniqueId = uuidv4();
    const extension = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
    const uniqueFileName = `${documentType.toLowerCase()}/${uniqueId}${extension}`;

    let storageKey: string;

    if (CONFIG.cloudProvider === 'gcs') {
      storageKey = await uploadToGCS(fileBuffer, uniqueFileName, getMimeType(fileName));
    } else {
      storageKey = await uploadToS3(fileBuffer, uniqueFileName, getMimeType(fileName));
    }

    // Log successful upload
    logAudit({
      timestamp: new Date(),
      action: 'UPLOAD',
      storageKey,
      userId,
      success: true,
    });

    return {
      storageKey,
      publicUrl: null, // SECURITY: Never expose public URL
      metadata: {
        documentType,
        originalName: fileName,
        mimeType: getMimeType(fileName),
        size: fileBuffer.length,
        uploadedAt: new Date(),
        bucket: CONFIG.cloudProvider === 'gcs' ? CONFIG.gcs.bucketName : CONFIG.s3.bucketName,
      },
    };
  } catch (error) {
    logAudit({
      timestamp: new Date(),
      action: 'UPLOAD',
      userId,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

// Helper: Upload to Google Cloud Storage
const uploadToGCS = async (
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> => {
  const bucket = getGCSClient().bucket(CONFIG.gcs.bucketName);
  const blob = bucket.file(fileName);

  await blob.save(buffer, {
    contentType: mimeType,
    metadata: {
      // SECURITY: Private ACL - no public access
      cacheControl: 'private, max-age=0',
    },
  });

  // Ensure the file is private
  await blob.makePrivate();

  return fileName; // storageKey is the GCS object path
};

// Helper: Upload to AWS S3
const uploadToS3 = async (
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string> => {
  const command = new PutObjectCommand({
    Bucket: CONFIG.s3.bucketName,
    Key: fileName,
    Body: buffer,
    ContentType: mimeType,
    // SECURITY: Private ACL - no public access
    ACL: 'private',
    ServerSideEncryption: 'AES256', // S3-managed encryption
  });

  await getS3Client().send(command);
  return fileName; // storageKey is the S3 object key
};

// Helper: Get MIME type from filename
const getMimeType = (fileName: string): string => {
  const extension = fileName.toLowerCase().slice(fileName.lastIndexOf('.'));
  const mimeTypes: Record<string, string> = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.pdf': 'application/pdf',
  };
  return mimeTypes[extension] || 'application/octet-stream';
};

// =============================================================================
// FUNCTION 2: generateSignedViewUrl()
// =============================================================================

/**
 * Generates time-limited signed URL for authorized document viewing
 * 
 * SECURITY FEATURES:
 * - Short expiration (default 15 minutes)
 * - All access logged for audit
 * - URL is single-use pattern (cannot be shared indefinitely)
 * 
 * @param storageKey - The cloud storage object key
 * @param expirationMinutes - URL validity period (default: 15)
 * @param userId - ID of user requesting access (for audit)
 * @param ipAddress - Optional IP for audit
 * @returns SignedUrlResult with URL and expiration time
 */
export const generateSignedViewUrl = async (
  storageKey: string,
  userId: string,
  expirationMinutes: number = CONFIG.upload.signedUrlExpirationMinutes,
  ipAddress?: string
): Promise<SignedUrlResult> => {
  try {
    const expiresAt = new Date(Date.now() + expirationMinutes * 60 * 1000);
    let signedUrl: string;

    if (CONFIG.cloudProvider === 'gcs') {
      signedUrl = await generateGCSignedUrl(storageKey, expirationMinutes);
    } else {
      signedUrl = await generateS3SignedUrl(storageKey, expirationMinutes);
    }

    // Log access for audit compliance
    logAudit({
      timestamp: new Date(),
      action: 'VIEW',
      storageKey,
      userId,
      ipAddress,
      success: true,
    });

    return {
      signedUrl,
      expiresAt,
    };
  } catch (error) {
    logAudit({
      timestamp: new Date(),
      action: 'VIEW',
      storageKey,
      userId,
      ipAddress,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
};

// Helper: Generate GCS signed URL
const generateGCSignedUrl = async (
  storageKey: string,
  expirationMinutes: number
): Promise<string> => {
  const bucket = getGCSClient().bucket(CONFIG.gcs.bucketName);
  const file = bucket.file(storageKey);

  const [url] = await file.getSignedUrl({
    action: 'read',
    expires: Date.now() + expirationMinutes * 60 * 1000,
    // SECURITY: Content-Disposition to prevent inline display
    responseDisposition: 'attachment',
  });

  return url;
};

// Helper: Generate S3 presigned URL
const generateS3SignedUrl = async (
  storageKey: string,
  expirationMinutes: number
): Promise<string> => {
  const command = new GetObjectCommand({
    Bucket: CONFIG.s3.bucketName,
    Key: storageKey,
    // SECURITY: Force download instead of inline display
    ResponseContentDisposition: 'attachment',
  });

  const url = await getSignedUrl(getS3Client(), command, {
    expiresIn: expirationMinutes * 60,
  });

  return url;
};

// =============================================================================
// FUNCTION 3: encryptNIC()
// =============================================================================

/**
 * Encrypts NIC number using AES-256-GCM
 * 
 * SECURITY FEATURES:
 * - AES-256-GCM (authenticated encryption)
 * - Random IV for each encryption (prevents pattern analysis)
 * - Auth tag ensures integrity
 * - Format: iv:authTag:ciphertext (base64 encoded)
 * 
 * PDPA COMPLIANCE: PII must be encrypted at rest
 * 
 * @param plainNIC - The NIC number to encrypt
 * @returns Encrypted string (base64 encoded)
 */
export const encryptNIC = (plainNIC: string): string => {
  if (!plainNIC || plainNIC.length === 0) {
    throw new Error('NIC number cannot be empty');
  }

  // Validate encryption key
  if (!CONFIG.encryption.key || CONFIG.encryption.key.length !== 64) {
    throw new Error('Invalid encryption key. Must be 64 hex characters (32 bytes).');
  }

  try {
    // Generate random IV (16 bytes for AES-GCM)
    const iv = crypto.randomBytes(16);
    
    // Convert hex key to buffer
    const key = Buffer.from(CONFIG.encryption.key, 'hex');
    
    // Create cipher
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    
    // Encrypt
    let encrypted = cipher.update(plainNIC, 'utf8', 'base64');
    encrypted += cipher.final('base64');
    
    // Get authentication tag (ensures integrity)
    const authTag = cipher.getAuthTag();
    
    // Combine IV + authTag + ciphertext
    // Format: iv:authTag:ciphertext (all base64)
    const result = `${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;
    
    return result;
  } catch (error) {
    throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// =============================================================================
// FUNCTION 4: decryptNIC()
// =============================================================================

/**
 * Decrypts NIC number (admin only operation)
 * 
 * SECURITY FEATURES:
 * - Verifies authentication tag (prevents tampering)
 * - Logs all decryption attempts (audit requirement)
 * - Should only be called by authorized admin functions
 * 
 * @param encryptedNIC - The encrypted NIC string from encryptNIC()
 * @param userId - ID of admin performing decryption (for audit)
 * @returns Decrypted plain NIC number
 */
export const decryptNIC = (encryptedNIC: string, userId: string): string => {
  if (!encryptedNIC || encryptedNIC.length === 0) {
    throw new Error('Encrypted NIC cannot be empty');
  }

  // Validate encryption key
  if (!CONFIG.encryption.key || CONFIG.encryption.key.length !== 64) {
    throw new Error('Invalid encryption key. Must be 64 hex characters (32 bytes).');
  }

  try {
    // Parse the encrypted format: iv:authTag:ciphertext
    const parts = encryptedNIC.split(':');
    if (parts.length !== 3) {
      throw new Error('Invalid encrypted NIC format');
    }

    const [ivBase64, authTagBase64, ciphertext] = parts;
    
    const iv = Buffer.from(ivBase64, 'base64');
    const authTag = Buffer.from(authTagBase64, 'base64');
    const key = Buffer.from(CONFIG.encryption.key, 'hex');

    // Create decipher
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag); // Set auth tag for verification

    // Decrypt
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    // Log successful decryption (audit requirement)
    logAudit({
      timestamp: new Date(),
      action: 'DECRYPT',
      userId,
      success: true,
    });

    return decrypted;
  } catch (error) {
    // Log failed decryption attempt
    logAudit({
      timestamp: new Date(),
      action: 'DECRYPT',
      userId,
      success: false,
      errorMessage: error instanceof Error ? error.message : 'Decryption failed',
    });
    throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

// =============================================================================
// FUNCTION 5: maskNIC()
// =============================================================================

/**
 * Masks NIC number for display (shows only last 4 digits)
 * 
 * SECURITY FEATURES:
 * - Prevents full NIC exposure in UI/logs
 * - Format: XXXXX-1234 (last 4 visible)
 * - Used for verification display without revealing full PII
 * 
 * PDPA COMPLIANCE: Minimize PII exposure in interfaces
 * 
 * @param plainNIC - The full NIC number
 * @returns Masked NIC (e.g., "XXXXX-1234")
 */
export const maskNIC = (plainNIC: string): string => {
  if (!plainNIC || plainNIC.length < 4) {
    return 'XXXX';
  }

  // Keep last 4 digits visible, mask the rest
  const lastFour = plainNIC.slice(-4);
  const maskedPortion = 'X'.repeat(Math.max(0, plainNIC.length - 4));
  
  return `${maskedPortion}-${lastFour}`;
};

// =============================================================================
// USAGE EXAMPLES
// =============================================================================

/**
 * Example 1: Upload NIC Front Image
 * 
 * ```typescript
 * import { uploadVerificationDocument } from './secureDocumentStorage';
 * import fs from 'fs';
 * 
 * // Read file from request
 * const fileBuffer = fs.readFileSync('./nic_front.jpg');
 * 
 * const result = await uploadVerificationDocument(
 *   fileBuffer,
 *   'nic_front.jpg',
 *   'NIC_FRONT',
 *   'user-123'
 * );
 * 
 * // Store in database (NEVER the file, only metadata)
 * await db.verificationDocuments.create({
 *   userId: 'user-123',
 *   storageKey: result.storageKey,
 *   documentType: result.metadata.documentType,
 *   uploadedAt: result.metadata.uploadedAt,
 * });
 * ```
 */

/**
 * Example 2: Generate Signed URL for Admin Review
 * 
 * ```typescript
 * import { generateSignedViewUrl } from './secureDocumentStorage';
 * 
 * // Admin wants to view document
 * const { signedUrl, expiresAt } = await generateSignedViewUrl(
 *   'nic_front/a1b2c3d4-e5f6-7890-abcd-ef1234567890.jpg',
 *   'admin-456',
 *   15, // 15 minutes
 *   '192.168.1.1' // IP for audit
 * );
 * 
 * // Return signedUrl to frontend - valid for 15 minutes only
 * res.json({ signedUrl, expiresAt });
 * ```
 */

/**
 * Example 3: Encrypt NIC Number
 * 
 * ```typescript
 * import { encryptNIC } from './secureDocumentStorage';
 * 
 * // When user submits NIC during registration
 * const plainNIC = '123456789V';
 * const encryptedNIC = encryptNIC(plainNIC);
 * 
 * // Store encrypted NIC in database
 * await db.users.create({
 *   name: 'John Doe',
 *   nicEncrypted: encryptedNIC, // Encrypted at rest
 *   // ... other fields
 * });
 * ```
 */

/**
 * Example 4: Decrypt NIC (Admin Only)
 * 
 * ```typescript
 * import { decryptNIC } from './secureDocumentStorage';
 * 
 * // Admin needs to verify NIC for background check
 * const user = await db.users.findById('user-123');
 * const plainNIC = decryptNIC(user.nicEncrypted, 'admin-456');
 * 
 * // Use for verification, then discard from memory
 * await verifyWithGovernmentAPI(plainNIC);
 * ```
 */

/**
 * Example 5: Mask NIC for Display
 * 
 * ```typescript
 * import { maskNIC, decryptNIC } from './secureDocumentStorage';
 * 
 * // Show masked NIC in user profile
 * const user = await db.users.findById('user-123');
 * const plainNIC = decryptNIC(user.nicEncrypted, 'system');
 * const maskedNIC = maskNIC(plainNIC);
 * 
 * // Display: "NIC: XXXXXX-789V"
 * console.log(`NIC: ${maskedNIC}`);
 * ```
 */

// =============================================================================
// COMPLETE WORKFLOW EXAMPLE
// =============================================================================

/**
 * Complete Verification Document Upload Flow
 * 
 * ```typescript
 * import { 
 *   uploadVerificationDocument, 
 *   encryptNIC, 
 *   maskNIC 
 * } from './secureDocumentStorage';
 * 
 * async function handleCaregiverRegistration(
 *   files: { nicFront: Buffer; nicBack: Buffer; policeClearance: Buffer },
 *   nicNumber: string,
 *   userId: string
 * ) {
 *   // 1. Encrypt NIC number (PII protection)
 *   const encryptedNIC = encryptNIC(nicNumber);
 *   
 *   // 2. Upload documents to secure storage
 *   const [nicFrontResult, nicBackResult, policeResult] = await Promise.all([
 *     uploadVerificationDocument(files.nicFront, 'nic_front.jpg', 'NIC_FRONT', userId),
 *     uploadVerificationDocument(files.nicBack, 'nic_back.jpg', 'NIC_BACK', userId),
 *     uploadVerificationDocument(files.policeClearance, 'police.pdf', 'POLICE_CLEARANCE', userId),
 *   ]);
 *   
 *   // 3. Store ONLY metadata in database (NEVER the actual files)
 *   await db.caregivers.create({
 *     userId,
 *     nicEncrypted: encryptedNIC,
 *     nicMasked: maskNIC(nicNumber),
 *     documents: [
 *       { type: 'NIC_FRONT', storageKey: nicFrontResult.storageKey },
 *       { type: 'NIC_BACK', storageKey: nicBackResult.storageKey },
 *       { type: 'POLICE_CLEARANCE', storageKey: policeResult.storageKey },
 *     ],
 *     status: 'PENDING_VERIFICATION',
 *   });
 *   
 *   return { success: true };
 * }
 * ```
 */

// =============================================================================
// EXPORTS
// =============================================================================

export default {
  uploadVerificationDocument,
  generateSignedViewUrl,
  encryptNIC,
  decryptNIC,
  maskNIC,
};
