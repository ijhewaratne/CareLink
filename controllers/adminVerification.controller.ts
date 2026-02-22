/**
 * Admin Verification Controller
 * Handles provider document verification by admin users
 * 
 * Features:
 * - List pending verification documents
 * - View documents via signed URLs (15-min expiration)
 * - Approve/reject documents with reasons
 * - Bulk verification operations
 * - Audit logging for all actions
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { PrismaClient, VerificationStatus, UserRole, DocumentType } from '@prisma/client';
import { generateSignedViewUrl } from '../utils/storage';
import { maskNIC } from '../utils/security';

const prisma = new PrismaClient();

// ============================================================================
// Validation Schemas
// ============================================================================

const reviewDocumentSchema = z.object({
  status: z.enum(['VERIFIED', 'REJECTED']),
  rejectionReason: z.string().optional(),
  notes: z.string().optional(),
});

const listDocumentsSchema = z.object({
  status: z.enum(['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED']).optional(),
  documentType: z.enum(['NIC_FRONT', 'NIC_BACK', 'POLICE_CLEARANCE', 'MEDICAL_CERTIFICATE', 'TRAINING_CERT']).optional(),
  page: z.string().transform(Number).default('1'),
  limit: z.string().transform(Number).default('20'),
});

const bulkReviewSchema = z.object({
  documentIds: z.array(z.string().uuid()),
  status: z.enum(['VERIFIED', 'REJECTED']),
  rejectionReason: z.string().optional(),
});

// ============================================================================
// Controller Functions
// ============================================================================

/**
 * GET /api/v1/admin/verifications/pending
 * 
 * List all pending verification documents with provider info
 * Requires ADMIN or SUPER_ADMIN role
 */
export async function listPendingVerifications(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check admin role
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(req.user?.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      });
      return;
    }

    const query = listDocumentsSchema.parse(req.query);
    const { status, documentType, page, limit } = query;

    const skip = (page - 1) * limit;

    // Build where clause
    const where: any = {
      status: status || VerificationStatus.PENDING,
    };
    if (documentType) {
      where.documentType = documentType;
    }

    // Fetch documents with provider info
    const [documents, total] = await Promise.all([
      prisma.verificationDoc.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              phoneNumber: true,
              role: true,
              profile: {
                select: {
                  fullName: true,
                  // NIC is encrypted - we only show masked version
                  nicEncrypted: true,
                  district: true,
                  city: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'asc' }, // Oldest first
        skip,
        take: limit,
      }),
      prisma.verificationDoc.count({ where }),
    ]);

    // Format response (mask PII)
    const formattedDocs = documents.map((doc) => ({
      id: doc.id,
      documentType: doc.documentType,
      status: doc.status,
      uploadedAt: doc.uploadedAt,
      fileName: doc.fileName,
      fileSize: doc.fileSize,
      provider: {
        id: doc.user.id,
        fullName: doc.user.profile?.fullName || 'N/A',
        phoneNumber: maskPhoneNumber(doc.user.phoneNumber),
        location: doc.user.profile ? `${doc.user.profile.city}, ${doc.user.profile.district}` : 'N/A',
        // Masked NIC - only show last 4 digits
        nicMasked: doc.user.profile?.nicEncrypted 
          ? maskNICFromEncrypted(doc.user.profile.nicEncrypted) 
          : null,
      },
    }));

    res.status(200).json({
      success: true,
      data: {
        documents: formattedDocs,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      },
    });

  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/verifications/:id/view
 * 
 * Generate signed URL for viewing a verification document
 * URL expires in 15 minutes
 * Requires ADMIN or SUPER_ADMIN role
 */
export async function viewDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check admin role
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(req.user?.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      });
      return;
    }

    const { id: documentId } = req.params;
    const adminId = req.user.id;

    // Fetch document
    const document = await prisma.verificationDoc.findUnique({
      where: { id: documentId },
      include: {
        user: {
          select: {
            id: true,
            profile: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!document) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Verification document not found',
        },
      });
      return;
    }

    // Generate signed URL (15-minute expiration)
    const signedUrl = await generateSignedViewUrl({
      storageProvider: document.storageProvider,
      storageBucket: document.storageBucket,
      storagePath: document.storagePath,
      expirationMinutes: 15,
    });

    // Log PII access (PDPA compliance)
    await prisma.piiAccessLog.create({
      data: {
        accessorId: adminId,
        accessorRole: req.user.role,
        subjectId: document.user.id,
        dataType: 'verification_document',
        purpose: 'Document verification review',
        legalBasis: 'contract', // Admin reviewing provider application
        endpoint: req.originalUrl,
        ipAddress: req.ip,
      },
    });

    // Update document status to UNDER_REVIEW if pending
    if (document.status === VerificationStatus.PENDING) {
      await prisma.verificationDoc.update({
        where: { id: documentId },
        data: { status: VerificationStatus.UNDER_REVIEW },
      });
    }

    res.status(200).json({
      success: true,
      data: {
        document: {
          id: document.id,
          documentType: document.documentType,
          fileName: document.fileName,
          mimeType: document.mimeType,
          uploadedAt: document.uploadedAt,
          provider: {
            id: document.user.id,
            fullName: document.user.profile?.fullName,
          },
        },
        viewUrl: signedUrl.url,
        expiresAt: signedUrl.expiresAt,
        instructions: 'This URL expires in 15 minutes. Do not share this URL.',
      },
    });

  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/verifications/:id/review
 * 
 * Approve or reject a verification document
 * Requires ADMIN or SUPER_ADMIN role
 */
export async function reviewDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check admin role
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(req.user?.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      });
      return;
    }

    const { id: documentId } = req.params;
    const adminId = req.user.id;

    // Validate request body
    const validationResult = reviewDocumentSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validationResult.error.format(),
        },
      });
      return;
    }

    const { status, rejectionReason, notes } = validationResult.data;

    // Fetch document
    const document = await prisma.verificationDoc.findUnique({
      where: { id: documentId },
      include: {
        user: {
          select: {
            id: true,
            profile: {
              select: {
                fullName: true,
              },
            },
          },
        },
      },
    });

    if (!document) {
      res.status(404).json({
        success: false,
        error: {
          code: 'DOCUMENT_NOT_FOUND',
          message: 'Verification document not found',
        },
      });
      return;
    }

    // Validate rejection reason required for rejections
    if (status === 'REJECTED' && !rejectionReason) {
      res.status(400).json({
        success: false,
        error: {
          code: 'REJECTION_REASON_REQUIRED',
          message: 'Rejection reason is required when rejecting a document',
        },
      });
      return;
    }

    // Update document
    const updatedDoc = await prisma.verificationDoc.update({
      where: { id: documentId },
      data: {
        status: status === 'VERIFIED' ? VerificationStatus.VERIFIED : VerificationStatus.REJECTED,
        verifiedAt: new Date(),
        verifiedBy: adminId,
        rejectionReason: status === 'REJECTED' ? rejectionReason : null,
        // Store notes in extractedData field (JSON)
        extractedData: notes ? JSON.stringify({ adminNotes: notes }) : null,
      },
    });

    // Log audit event
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: `DOCUMENT_${status}`,
        entityType: 'VerificationDoc',
        entityId: documentId,
        oldValues: JSON.stringify({ status: document.status }),
        newValues: JSON.stringify({ 
          status: updatedDoc.status,
          verifiedBy: adminId,
          rejectionReason: updatedDoc.rejectionReason,
        }),
        reason: rejectionReason || notes || 'Document review completed',
      },
    });

    // Check if all required documents are verified for this provider
    if (status === 'VERIFIED') {
      await checkAndUpdateProviderVerification(document.user.id);
    }

    // Send notification to provider
    await sendVerificationResultNotification(
      document.user.id,
      document.documentType,
      status,
      rejectionReason
    );

    res.status(200).json({
      success: true,
      data: {
        message: `Document ${status.toLowerCase()} successfully`,
        document: {
          id: updatedDoc.id,
          status: updatedDoc.status,
          verifiedAt: updatedDoc.verifiedAt,
          rejectionReason: updatedDoc.rejectionReason,
        },
      },
    });

  } catch (error) {
    next(error);
  }
}

/**
 * POST /api/v1/admin/verifications/bulk-review
 * 
 * Bulk approve or reject multiple documents
 * Requires SUPER_ADMIN role
 */
export async function bulkReviewDocuments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Only SUPER_ADMIN can do bulk operations
    if (req.user?.role !== UserRole.SUPER_ADMIN) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Super admin access required for bulk operations',
        },
      });
      return;
    }

    const validationResult = bulkReviewSchema.safeParse(req.body);
    if (!validationResult.success) {
      res.status(400).json({
        success: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request body',
          details: validationResult.error.format(),
        },
      });
      return;
    }

    const { documentIds, status, rejectionReason } = validationResult.data;
    const adminId = req.user.id;

    // Validate rejection reason for rejections
    if (status === 'REJECTED' && !rejectionReason) {
      res.status(400).json({
        success: false,
        error: {
          code: 'REJECTION_REASON_REQUIRED',
          message: 'Rejection reason is required for bulk rejections',
        },
      });
      return;
    }

    // Update all documents
    const result = await prisma.verificationDoc.updateMany({
      where: {
        id: { in: documentIds },
      },
      data: {
        status: status === 'VERIFIED' ? VerificationStatus.VERIFIED : VerificationStatus.REJECTED,
        verifiedAt: new Date(),
        verifiedBy: adminId,
        rejectionReason: status === 'REJECTED' ? rejectionReason : null,
      },
    });

    // Log bulk audit event
    await prisma.auditLog.create({
      data: {
        userId: adminId,
        action: `BULK_DOCUMENT_${status}`,
        entityType: 'VerificationDoc',
        newValues: JSON.stringify({
          documentIds,
          status,
          count: result.count,
        }),
        reason: `Bulk ${status.toLowerCase()} of ${result.count} documents`,
      },
    });

    res.status(200).json({
      success: true,
      data: {
        message: `${result.count} documents ${status.toLowerCase()} successfully`,
        count: result.count,
      },
    });

  } catch (error) {
    next(error);
  }
}

/**
 * GET /api/v1/admin/providers/:id/verification-status
 * 
 * Get complete verification status for a provider
 */
export async function getProviderVerificationStatus(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // Check admin role
    if (![UserRole.ADMIN, UserRole.SUPER_ADMIN].includes(req.user?.role)) {
      res.status(403).json({
        success: false,
        error: {
          code: 'FORBIDDEN',
          message: 'Admin access required',
        },
      });
      return;
    }

    const { id: providerId } = req.params;

    // Fetch provider with documents
    const provider = await prisma.user.findUnique({
      where: { id: providerId },
      include: {
        profile: {
          select: {
            fullName: true,
            trustScore: true,
            isAvailable: true,
          },
        },
        documents: {
          orderBy: { createdAt: 'desc' },
        },
        providerSkills: {
          include: {
            serviceCategory: {
              select: {
                nameEn: true,
                requiresVerification: true,
              },
            },
          },
        },
      },
    });

    if (!provider || provider.role !== UserRole.PROVIDER) {
      res.status(404).json({
        success: false,
        error: {
          code: 'PROVIDER_NOT_FOUND',
          message: 'Provider not found',
        },
      });
      return;
    }

    // Get required documents for their skills
    const requiredDocTypes = new Set<DocumentType>();
    provider.providerSkills.forEach((skill) => {
      const required = skill.serviceCategory.requiresVerification as DocumentType[];
      required.forEach((docType) => requiredDocTypes.add(docType));
    });

    // Group documents by type (get latest for each)
    const latestDocsByType = new Map();
    provider.documents.forEach((doc) => {
      if (!latestDocsByType.has(doc.documentType) || 
          doc.createdAt > latestDocsByType.get(doc.documentType).createdAt) {
        latestDocsByType.set(doc.documentType, doc);
      }
    });

    // Build verification status
    const documentStatus = Array.from(requiredDocTypes).map((docType) => {
      const doc = latestDocsByType.get(docType);
      return {
        documentType: docType,
        required: true,
        uploaded: !!doc,
        status: doc?.status || 'NOT_UPLOADED',
        uploadedAt: doc?.uploadedAt || null,
        verifiedAt: doc?.verifiedAt || null,
      };
    });

    const allVerified = documentStatus.every(
      (d) => d.status === VerificationStatus.VERIFIED
    );

    res.status(200).json({
      success: true,
      data: {
        provider: {
          id: provider.id,
          fullName: provider.profile?.fullName,
          trustScore: provider.profile?.trustScore,
          isAvailable: provider.profile?.isAvailable,
        },
        verificationStatus: {
          allDocumentsVerified: allVerified,
          documents: documentStatus,
        },
      },
    });

  } catch (error) {
    next(error);
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Checks if all required documents are verified and updates provider status
 */
async function checkAndUpdateProviderVerification(providerId: string): Promise<void> {
  const provider = await prisma.user.findUnique({
    where: { id: providerId },
    include: {
      providerSkills: {
        include: {
          serviceCategory: true,
        },
      },
      documents: true,
    },
  });

  if (!provider) return;

  // Get required document types for all their skills
  const requiredDocTypes = new Set<DocumentType>();
  provider.providerSkills.forEach((skill) => {
    const required = skill.serviceCategory.requiresVerification as DocumentType[];
    required.forEach((docType) => requiredDocTypes.add(docType));
  });

  // Get latest document for each type
  const latestDocsByType = new Map();
  provider.documents.forEach((doc) => {
    if (!latestDocsByType.has(doc.documentType) || 
        doc.createdAt > latestDocsByType.get(doc.documentType).createdAt) {
      latestDocsByType.set(doc.documentType, doc);
    }
  });

  // Check if all required documents are verified
  const allVerified = Array.from(requiredDocTypes).every(
    (docType) => latestDocsByType.get(docType)?.status === VerificationStatus.VERIFIED
  );

  if (allVerified) {
    // Update all provider skills to verified
    await prisma.providerSkill.updateMany({
      where: { providerId },
      data: { isVerified: true },
    });

    // Update profile availability
    await prisma.profile.update({
      where: { userId: providerId },
      data: { isAvailable: true },
    });
  }
}

/**
 * Masks phone number for display (e.g., +94-XXX-XXX-1234)
 */
function maskPhoneNumber(phone: string): string {
  if (phone.length < 8) return phone;
  return phone.slice(0, -4).replace(/./g, 'X') + phone.slice(-4);
}

/**
 * Gets masked NIC from encrypted value (placeholder - actual decryption needed)
 */
function maskNICFromEncrypted(encryptedNIC: string): string {
  // In production, decrypt then mask
  // For now, return placeholder
  return 'XXXXX-XXXX';
}

/**
 * Sends verification result notification to provider
 */
async function sendVerificationResultNotification(
  providerId: string,
  documentType: DocumentType,
  status: 'VERIFIED' | 'REJECTED',
  rejectionReason?: string
): Promise<void> {
  // Import notification service
  const { sendNotification } = await import('../services/notification.service');

  const documentTypeNames: Record<DocumentType, string> = {
    [DocumentType.NIC_FRONT]: 'NIC (Front)',
    [DocumentType.NIC_BACK]: 'NIC (Back)',
    [DocumentType.POLICE_CLEARANCE]: 'Police Clearance',
    [DocumentType.MEDICAL_CERTIFICATE]: 'Medical Certificate',
    [DocumentType.TRAINING_CERT]: 'Training Certificate',
    [DocumentType.REFERENCE_LETTER]: 'Reference Letter',
    [DocumentType.PROFILE_PHOTO]: 'Profile Photo',
  };

  const title = status === 'VERIFIED' 
    ? 'Document Verified!' 
    : 'Document Rejected';
  
  const body = status === 'VERIFIED'
    ? `Your ${documentTypeNames[documentType]} has been verified. You're one step closer to being approved!`
    : `Your ${documentTypeNames[documentType]} was rejected. Reason: ${rejectionReason}`;

  await sendNotification({
    userId: providerId,
    type: status === 'VERIFIED' ? 'PROVIDER_VERIFIED' : 'SYSTEM_ANNOUNCEMENT',
    payload: {
      title,
      body,
      data: {
        documentType,
        status,
        rejectionReason: rejectionReason || undefined,
      },
    },
  });
}

// ============================================================================
// Routes Configuration
// ============================================================================

/**
 * Express router configuration for admin verification routes
 * 
 * Usage:
 * ```typescript
 * import { Router } from 'express';
 * import {
 *   listPendingVerifications,
 *   viewDocument,
 *   reviewDocument,
 *   bulkReviewDocuments,
 *   getProviderVerificationStatus,
 * } from '../controllers/adminVerification.controller';
 * import { authenticate, requireRole } from '../middleware/auth.middleware';
 * 
 * const router = Router();
 * 
 * router.get(
 *   '/verifications/pending',
 *   authenticate,
 *   requireRole(['ADMIN', 'SUPER_ADMIN']),
 *   listPendingVerifications
 * );
 * 
 * router.get(
 *   '/verifications/:id/view',
 *   authenticate,
 *   requireRole(['ADMIN', 'SUPER_ADMIN']),
 *   viewDocument
 * );
 * 
 * router.post(
 *   '/verifications/:id/review',
 *   authenticate,
 *   requireRole(['ADMIN', 'SUPER_ADMIN']),
 *   reviewDocument
 * );
 * 
 * router.post(
 *   '/verifications/bulk-review',
 *   authenticate,
 *   requireRole(['SUPER_ADMIN']),
 *   bulkReviewDocuments
 * );
 * 
 * router.get(
 *   '/providers/:id/verification-status',
 *   authenticate,
 *   requireRole(['ADMIN', 'SUPER_ADMIN']),
 *   getProviderVerificationStatus
 * );
 * 
 * export default router;
 * ```
 */
