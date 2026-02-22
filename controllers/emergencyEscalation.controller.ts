/**
 * Emergency Escalation Controller
 * Express route handler for POST /api/v1/shifts/:id/escalate
 * 
 * CRITICAL SAFETY NOTE:
 * This endpoint does NOT provide medical assistance. It:
 * 1. Returns the appropriate emergency number to call (hospital-specific or 1990)
 * 2. Notifies the customer's emergency contact via SMS
 * 3. Freezes the shift for admin review
 * 
 * The Flutter app must immediately open the native dialer with the returned number.
 */

import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import {
  escalateEmergency,
  EmergencyEscalationInput,
  EmergencyEscalationResult,
  getEmergencyContactInfo,
  updateEmergencyContact,
} from '../services/emergencyEscalation.service';
import { AppError } from '../errors/AppError';
import { authenticate } from '../middleware/auth.middleware';

// ============================================================================
// Validation Schemas
// ============================================================================

const escalateEmergencySchema = z.object({
  triggeredBy: z.enum(['CUSTOMER', 'PROVIDER']),
  reason: z.string().optional(),
  location: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
  }).optional(),
});

const updateEmergencyContactSchema = z.object({
  emergencyName: z.string().min(1).max(255),
  emergencyPhone: z.string().regex(/^\+?[0-9]{10,15}$/, 'Invalid phone number'),
  emergencyRelation: z.string().min(1).max(50),
});

// ============================================================================
// Controller Functions
// ============================================================================

/**
 * POST /api/v1/shifts/:id/escalate
 * 
 * Emergency escalation endpoint - handles emergency button presses
 * 
 * Request Body:
 * - triggeredBy: 'CUSTOMER' | 'PROVIDER' - Who pressed the button
 * - reason?: Optional description of the emergency
 * - location?: Current GPS coordinates
 * 
 * Response:
 * - 200: Emergency number returned, SMS sent, shift frozen
 * - 400: Invalid shift ID or shift not in active state
 * - 404: Shift not found
 * - 500: Internal error
 * 
 * FLUTTER APP INTEGRATION:
 * On receiving 200 response, immediately call:
 * ```dart
 * final Uri phoneUri = Uri(scheme: 'tel', path: response.emergencyNumber);
 * await launchUrl(phoneUri);
 * ```
 */
export async function escalateEmergencyHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const { id: shiftId } = req.params;
    const userId = req.user?.id; // From auth middleware

    if (!userId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    // Validate request body
    const validationResult = escalateEmergencySchema.safeParse(req.body);
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

    const { triggeredBy, reason, location } = validationResult.data;

    // Call escalation service
    const result: EmergencyEscalationResult = await escalateEmergency({
      shiftId,
      triggeredBy,
      triggeredByUserId: userId,
      reason,
      location,
    });

    // Return success response
    res.status(200).json({
      success: true,
      data: {
        message: 'Emergency escalated successfully',
        emergencyNumber: result.emergencyNumber,
        shiftFrozen: result.shiftFrozen,
        smsSentToEmergencyContact: result.smsSent,
        incidentReported: result.incidentReported,
        instructions: 'Immediately call the emergency number provided. The emergency contact has been notified.',
      },
    });

  } catch (error) {
    if (error instanceof AppError) {
      res.status(error.statusCode).json(error.toJSON());
      return;
    }

    if (error instanceof Error && error.message.includes('not found')) {
      res.status(404).json({
        success: false,
        error: {
          code: 'SHIFT_NOT_FOUND',
          message: error.message,
        },
      });
      return;
    }

    if (error instanceof Error && error.message.includes('active state')) {
      res.status(400).json({
        success: false,
        error: {
          code: 'INVALID_SHIFT_STATE',
          message: error.message,
        },
      });
      return;
    }

    next(error);
  }
}

/**
 * GET /api/v1/users/me/emergency-contact
 * 
 * Get current user's emergency contact information
 */
export async function getEmergencyContactHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    const contactInfo = await getEmergencyContactInfo(userId);

    res.status(200).json({
      success: true,
      data: contactInfo,
    });

  } catch (error) {
    next(error);
  }
}

/**
 * PUT /api/v1/users/me/emergency-contact
 * 
 * Update current user's emergency contact information
 */
export async function updateEmergencyContactHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const userId = req.user?.id;

    if (!userId) {
      res.status(401).json({
        success: false,
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
        },
      });
      return;
    }

    // Validate request body
    const validationResult = updateEmergencyContactSchema.safeParse(req.body);
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

    await updateEmergencyContact(userId, validationResult.data);

    res.status(200).json({
      success: true,
      data: {
        message: 'Emergency contact updated successfully',
      },
    });

  } catch (error) {
    next(error);
  }
}

// ============================================================================
// Route Configuration
// ============================================================================

/**
 * Express router configuration for emergency routes
 * 
 * Usage:
 * ```typescript
 * import { Router } from 'express';
 * import {
 *   escalateEmergencyHandler,
 *   getEmergencyContactHandler,
 *   updateEmergencyContactHandler,
 * } from '../controllers/emergencyEscalation.controller';
 * import { authenticate } from '../middleware/auth.middleware';
 * 
 * const router = Router();
 * 
 * // Emergency escalation
 * router.post(
 *   '/shifts/:id/escalate',
 *   authenticate,
 *   escalateEmergencyHandler
 * );
 * 
 * // Emergency contact management
 * router.get(
 *   '/users/me/emergency-contact',
 *   authenticate,
 *   getEmergencyContactHandler
 * );
 * router.put(
 *   '/users/me/emergency-contact',
 *   authenticate,
 *   updateEmergencyContactHandler
 * );
 * 
 * export default router;
 * ```
 */
