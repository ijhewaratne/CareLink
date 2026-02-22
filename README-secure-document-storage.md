# CareLink - Secure Document Storage Module

## Overview

This module provides secure document storage for CareLink, a care services marketplace in Sri Lanka, with full compliance to the **Sri Lanka Personal Data Protection Act (PDPA)**.

## Security Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           CARELINK DOCUMENT FLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  USER UPLOAD                    DATABASE                    CLOUD STORAGE   │
│  ───────────                    ────────                    ─────────────   │
│                                                                             │
│  ┌──────────┐    Upload      ┌──────────────┐    Reference    ┌─────────┐  │
│  │ NIC      │ ─────────────> │ storageKey   │ ──────────────> │ Private │  │
│  │ Image    │    Document    │ metadata     │    Only         │  Bucket │  │
│  └──────────┘                │ (NO file!)   │                 └─────────┘  │
│                              └──────────────┘                               │
│                              │ nicEncrypted │                               │
│                              │ nicMasked    │                               │
│                              └──────────────┘                               │
│                                                                             │
│  ADMIN VIEW                                                                 │
│  ──────────                                                                 │
│                                                                             │
│  ┌──────────┐    Signed URL   ┌──────────────┐    15-min URL    ┌─────────┐│
│  │ Admin    │ <────────────── │ Generate     │ <─────────────── │ Access  ││
│  │ Browser  │    (logged)     │ Signed URL   │                  │ Granted ││
│  └──────────┘                 └──────────────┘                  └─────────┘│
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Critical Security Principles

### 1. Documents NEVER Stored in Database
- Only `storageKey` references are stored in PostgreSQL
- Actual files live in private GCS/S3 buckets
- Prevents database bloat and ensures separation of concerns

### 2. Private Cloud Buckets
- Buckets have **NO public access**
- Uniform bucket-level access enabled
- CORS configured only for your domain

### 3. Short-Lived Signed URLs
- Default expiration: **15 minutes**
- Each URL is unique and time-bound
- All URL generation is logged

### 4. PII Encryption at Rest
- NIC numbers encrypted with **AES-256-GCM**
- Random IV for each encryption
- Authentication tag prevents tampering

### 5. Comprehensive Audit Logging
- All document access logged
- NIC decryption logged separately (highly sensitive)
- Required for PDPA compliance

## API Functions

### 1. `uploadVerificationDocument()`

Uploads verification documents to secure cloud storage.

```typescript
const result = await uploadVerificationDocument(
  fileBuffer,           // Buffer from multer/express-fileupload
  'nic_front.jpg',      // Original filename
  'NIC_FRONT',          // Document type
  'user-123'            // User ID for audit
);

// Returns:
{
  storageKey: 'nic_front/a1b2c3d4-...jpg',  // GCS/S3 object path
  publicUrl: null,                           // NEVER public!
  metadata: {
    documentType: 'NIC_FRONT',
    originalName: 'nic_front.jpg',
    mimeType: 'image/jpeg',
    size: 1024000,
    uploadedAt: Date,
    bucket: 'carelink-verification-docs'
  }
}
```

**Security Features:**
- File type validation (JPEG, PNG, PDF only)
- File size limit (default 5MB)
- Magic number verification (prevents spoofing)
- Unique UUID filename (prevents enumeration)

### 2. `generateSignedViewUrl()`

Generates time-limited URL for admin document viewing.

```typescript
const { signedUrl, expiresAt } = await generateSignedViewUrl(
  'nic_front/a1b2c3d4-...jpg',  // storageKey from DB
  'admin-456',                   // Admin ID for audit
  15,                            // Expiration minutes
  '192.168.1.1'                  // IP for audit (optional)
);

// Returns:
{
  signedUrl: 'https://storage.googleapis.com/...?X-Goog-Signature=...',
  expiresAt: Date  // 15 minutes from now
}
```

### 3. `encryptNIC()`

Encrypts NIC number using AES-256-GCM.

```typescript
const encrypted = encryptNIC('123456789V');
// Returns: "base64(iv):base64(authTag):base64(ciphertext)"
```

### 4. `decryptNIC()`

Decrypts NIC number (admin only).

```typescript
const plainNIC = decryptNIC(encryptedNIC, 'admin-456');
// Returns: "123456789V"
```

### 5. `maskNIC()`

Masks NIC for display (shows only last 4 digits).

```typescript
const masked = maskNIC('123456789V');
// Returns: "XXXXX-789V"
```

## Environment Configuration

Copy `.env.example` to `.env` and configure:

```bash
# Required
CLOUD_PROVIDER=gcs                    # or 's3'
GCS_BUCKET_NAME=your-bucket-name
GCS_PROJECT_ID=your-project-id
ENCRYPTION_KEY=64-char-hex-string     # Generate with: openssl rand -hex 32

# Optional
MAX_FILE_SIZE_MB=5
SIGNED_URL_EXPIRATION_MINUTES=15
```

**Generate Encryption Key:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## Database Schema

See `database-schema.sql` for complete PostgreSQL schema.

Key tables:
- `verification_documents` - Document metadata (NO file content)
- `document_access_logs` - Audit trail for all access
- `nic_decryption_logs` - Special log for NIC decryption

## Complete Workflow Example

```typescript
import {
  uploadVerificationDocument,
  generateSignedViewUrl,
  encryptNIC,
  maskNIC
} from './secureDocumentStorage';

// 1. Caregiver Registration
async function registerCaregiver(
  files: { nicFront: Buffer; nicBack: Buffer; policeClearance: Buffer },
  nicNumber: string,
  userId: string
) {
  // Encrypt NIC
  const encryptedNIC = encryptNIC(nicNumber);
  
  // Upload documents
  const [nicFront, nicBack, police] = await Promise.all([
    uploadVerificationDocument(files.nicFront, 'nic_front.jpg', 'NIC_FRONT', userId),
    uploadVerificationDocument(files.nicBack, 'nic_back.jpg', 'NIC_BACK', userId),
    uploadVerificationDocument(files.policeClearance, 'police.pdf', 'POLICE_CLEARANCE', userId),
  ]);
  
  // Store metadata in database (NEVER the files!)
  await db.caregivers.create({
    userId,
    nicEncrypted: encryptedNIC,
    nicMasked: maskNIC(nicNumber),
    documents: [
      { type: 'NIC_FRONT', storageKey: nicFront.storageKey },
      { type: 'NIC_BACK', storageKey: nicBack.storageKey },
      { type: 'POLICE_CLEARANCE', storageKey: police.storageKey },
    ],
    status: 'PENDING_VERIFICATION',
  });
}

// 2. Admin Document Review
async function reviewDocument(documentId: string, adminId: string) {
  const doc = await db.verificationDocuments.findById(documentId);
  
  // Generate 15-minute signed URL
  const { signedUrl, expiresAt } = await generateSignedViewUrl(
    doc.storageKey,
    adminId,
    15
  );
  
  // Return to admin frontend
  return { signedUrl, expiresAt };
}
```

## PDPA Compliance Checklist

- [x] PII encrypted at rest (NIC numbers)
- [x] Documents stored separately from database
- [x] Access controlled via signed URLs
- [x] All access logged for audit
- [x] File validation prevents malicious uploads
- [x] Masked display of sensitive data
- [x] Short-lived access tokens

## Security Checklist

- [ ] Encryption key stored in secrets manager (not .env in production)
- [ ] Cloud bucket blocks ALL public access
- [ ] Service account has minimal permissions
- [ ] CORS configured only for your domain
- [ ] Audit logs persisted to secure storage
- [ ] HTTPS enforced for all endpoints
- [ ] Rate limiting on upload endpoints
- [ ] Virus scanning for uploaded files (recommended)

## Testing

```bash
# Run unit tests
npm test secureDocumentStorage.test.ts

# Test encryption/decryption
npm run test:encryption

# Test file validation
npm run test:validation
```

## Dependencies

```json
{
  "@google-cloud/storage": "^7.x",
  "@aws-sdk/client-s3": "^3.x",
  "@aws-sdk/s3-request-presigner": "^3.x",
  "uuid": "^9.x",
  "crypto": "node:builtin"
}
```

## License

Internal use only - CareLink Sri Lanka
