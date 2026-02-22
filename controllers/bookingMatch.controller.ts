/**
 * Booking Match Controller
 * Express route handler for POST /api/v1/bookings/match
 * Handles request validation, service invocation, and response formatting
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import {
  createBookingAndFindMatches,
  BookingMatchResult,
} from '../services/bookingMatch.service';
import {
  validateCreateBookingMatch,
  formatValidationErrors,
  CreateBookingMatchInput,
} from '../validators/booking.validator';
import {
  AppError,
  ValidationError,
  isAppError,
} from '../errors/AppError';
import { BookingMatchResponse, ErrorResponse } from '../types/booking.types';

// ============================================================================
// Controller Function
// ============================================================================

/**
 * POST /api/v1/bookings/match
 * 
 * Creates a new booking and finds matching providers within 10km radius
 * 
 * Request Body:
 * - customerId: UUID of the customer
 * - careRecipientName: Name of the person receiving care
 * - serviceCategorySlug: Slug of the service category (e.g., "hospital-attendant")
 * - location: { lat, lng, address? }
 * - scheduledDate: ISO 8601 date string
 * - notes?: Optional additional notes
 * 
 * Response:
 * - 201: Booking created with matched providers
 * - 400: Validation error
 * - 404: Customer or service category not found
 * - 500: Internal server error
 */
export async function createBookingMatchHandler(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // ========================================================================
    // Step 1: Validate Request Body
    // ========================================================================
    let validatedInput: CreateBookingMatchInput;
    
    try {
      validatedInput = validateCreateBookingMatch(req.body);
    } catch (error) {
      // Handle Zod validation errors
      if (error instanceof ZodError) {
        const formattedErrors = formatValidationErrors(error);
        const validationError = new ValidationError(
          'Request validation failed',
          formattedErrors
        );
        
        // Send error response directly
        res.status(400).json(validationError.toJSON());
        return;
      }
      
      // Re-throw unknown errors
      throw error;
    }

    // ========================================================================
    // Step 2: Call Service Layer
    // ========================================================================
    const result: BookingMatchResult = await createBookingAndFindMatches(
      validatedInput
    );

    // ========================================================================
    // Step 3: Format and Send Success Response
    // ========================================================================
    const response: BookingMatchResponse = {
      success: true,
      data: {
        booking: result.booking,
        matchedProviders: result.matchedProviders,
        totalMatches: result.totalMatches,
      },
    };

    // Return 201 Created for successful booking creation
    res.status(201).json(response);

  } catch (error) {
    // ========================================================================
    // Step 4: Handle Errors
    // ========================================================================
    
    // If it's an AppError, send appropriate response
    if (isAppError(error)) {
      const statusCode = error.statusCode;
      const errorResponse: ErrorResponse = error.toJSON();
      
      res.status(statusCode).json(errorResponse);
      return;
    }

    // For unknown errors, pass to global error handler
    next(error);
  }
}

// ============================================================================
// Alternative: Async Handler Wrapper Pattern
// ============================================================================

/**
 * Type definition for async request handler
 */
type AsyncRequestHandler = (
  req: Request,
  res: Response,
  next: NextFunction
) => Promise<void | Response>;

/**
 * Wrapper to catch async errors automatically
 * Eliminates need for try-catch in every handler
 */
export const asyncHandler = (fn: AsyncRequestHandler): AsyncRequestHandler => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

/**
 * Alternative implementation using asyncHandler wrapper
 * More concise but requires global error handler middleware
 */
export const createBookingMatchHandlerWrapped = asyncHandler(
  async (req: Request, res: Response): Promise<void> => {
    // Validate input
    const validatedInput = validateCreateBookingMatch(req.body);
    
    // Call service
    const result = await createBookingAndFindMatches(validatedInput);
    
    // Send response
    res.status(201).json({
      success: true,
      data: {
        booking: result.booking,
        matchedProviders: result.matchedProviders,
        totalMatches: result.totalMatches,
      },
    });
  }
);

// ============================================================================
// Route Configuration Helper
// ============================================================================

/**
 * Example route configuration for Express router
 * 
 * Usage in routes file:
 * ```typescript
 * import { Router } from 'express';
 * import { createBookingMatchHandler } from '../controllers/bookingMatch.controller';
 * import { authenticate } from '../middleware/auth.middleware';
 * 
 * const router = Router();
 * 
 * router.post(
 *   '/match',
 *   authenticate,           // JWT authentication middleware
 *   createBookingMatchHandler
 * );
 * 
 * export default router;
 * ```
 */

// ============================================================================
// Request/Response Type Exports
// ============================================================================

/**
 * Extended Request type with validated body
 */
export interface CreateBookingMatchRequest extends Request {
  body: CreateBookingMatchInput;
}

// Re-export types for convenience
export { CreateBookingMatchInput, BookingMatchResult };
