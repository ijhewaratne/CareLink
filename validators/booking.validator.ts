/**
 * Input Validation for Booking Match Endpoint
 * Uses Zod for schema validation with detailed error messages
 */

import { z } from 'zod';

// ============================================================================
// Validation Constants
// ============================================================================

const VALIDATION_CONSTANTS = {
  // Sri Lanka coordinate bounds
  LAT_MIN: 5.8,
  LAT_MAX: 9.9,
  LNG_MIN: 79.5,
  LNG_MAX: 81.9,
  
  // String length limits
  CARE_RECIPIENT_NAME_MIN: 2,
  CARE_RECIPIENT_NAME_MAX: 100,
  NOTES_MAX: 1000,
  SERVICE_CATEGORY_SLUG_MAX: 50,
  
  // UUID validation pattern
  UUID_REGEX: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
} as const;

// ============================================================================
// Location Schema
// ============================================================================

/**
 * Schema for booking location with Sri Lanka coordinate validation
 */
export const bookingLocationSchema = z.object({
  lat: z.number()
    .min(VALIDATION_CONSTANTS.LAT_MIN, {
      message: `Latitude must be at least ${VALIDATION_CONSTANTS.LAT_MIN} (Sri Lanka bounds)`,
    })
    .max(VALIDATION_CONSTANTS.LAT_MAX, {
      message: `Latitude must be at most ${VALIDATION_CONSTANTS.LAT_MAX} (Sri Lanka bounds)`,
    })
    .refine((val) => !isNaN(val), {
      message: 'Latitude must be a valid number',
    }),
  
  lng: z.number()
    .min(VALIDATION_CONSTANTS.LNG_MIN, {
      message: `Longitude must be at least ${VALIDATION_CONSTANTS.LNG_MIN} (Sri Lanka bounds)`,
    })
    .max(VALIDATION_CONSTANTS.LNG_MAX, {
      message: `Longitude must be at most ${VALIDATION_CONSTANTS.LNG_MAX} (Sri Lanka bounds)`,
    })
    .refine((val) => !isNaN(val), {
      message: 'Longitude must be a valid number',
    }),
  
  address: z.string()
    .max(500, { message: 'Address must not exceed 500 characters' })
    .optional(),
});

// ============================================================================
// Create Booking Match Request Schema
// ============================================================================

/**
 * Main validation schema for POST /api/v1/bookings/match
 * Validates all required fields with detailed error messages
 */
export const createBookingMatchSchema = z.object({
  customerId: z.string()
    .min(1, { message: 'Customer ID is required' })
    .regex(VALIDATION_CONSTANTS.UUID_REGEX, {
      message: 'Customer ID must be a valid UUID',
    }),
  
  careRecipientName: z.string()
    .min(VALIDATION_CONSTANTS.CARE_RECIPIENT_NAME_MIN, {
      message: `Care recipient name must be at least ${VALIDATION_CONSTANTS.CARE_RECIPIENT_NAME_MIN} characters`,
    })
    .max(VALIDATION_CONSTANTS.CARE_RECIPIENT_NAME_MAX, {
      message: `Care recipient name must not exceed ${VALIDATION_CONSTANTS.CARE_RECIPIENT_NAME_MAX} characters`,
    })
    .trim(),
  
  serviceCategorySlug: z.string()
    .min(1, { message: 'Service category slug is required' })
    .max(VALIDATION_CONSTANTS.SERVICE_CATEGORY_SLUG_MAX, {
      message: `Service category slug must not exceed ${VALIDATION_CONSTANTS.SERVICE_CATEGORY_SLUG_MAX} characters`,
    })
    .regex(/^[a-z0-9-]+$/, {
      message: 'Service category slug must be lowercase alphanumeric with hyphens only',
    }),
  
  location: bookingLocationSchema,
  
  scheduledDate: z.string()
    .min(1, { message: 'Scheduled date is required' })
    .refine((val) => {
      const date = new Date(val);
      return !isNaN(date.getTime());
    }, {
      message: 'Scheduled date must be a valid ISO 8601 date string',
    })
    .refine((val) => {
      const date = new Date(val);
      const now = new Date();
      // Allow bookings from now onwards (with 1 minute buffer for past dates)
      return date.getTime() >= now.getTime() - 60000;
    }, {
      message: 'Scheduled date must be in the future',
    }),
  
  notes: z.string()
    .max(VALIDATION_CONSTANTS.NOTES_MAX, {
      message: `Notes must not exceed ${VALIDATION_CONSTANTS.NOTES_MAX} characters`,
    })
    .optional(),
});

// ============================================================================
// Type Inference
// ============================================================================

/**
 * Inferred TypeScript type from the validation schema
 */
export type CreateBookingMatchInput = z.infer<typeof createBookingMatchSchema>;

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Validates the booking match request body
 * @param data - Raw request body
 * @returns Validated and typed data
 * @throws ZodError with detailed validation errors
 */
export function validateCreateBookingMatch(data: unknown): CreateBookingMatchInput {
  return createBookingMatchSchema.parse(data);
}

/**
 * Safely validates the booking match request body
 * @param data - Raw request body
 * @returns Object with success flag and either data or error
 */
export function safeValidateCreateBookingMatch(
  data: unknown
): { success: true; data: CreateBookingMatchInput } | { success: false; error: z.ZodError } {
  const result = createBookingMatchSchema.safeParse(data);
  
  if (result.success) {
    return { success: true, data: result.data };
  }
  
  return { success: false, error: result.error };
}

/**
 * Formats Zod validation errors into a user-friendly format
 * @param error - ZodError instance
 * @returns Formatted error object with field-level details
 */
export function formatValidationErrors(error: z.ZodError): Record<string, string[]> {
  const formattedErrors: Record<string, string[]> = {};
  
  error.errors.forEach((err) => {
    const path = err.path.join('.');
    if (!formattedErrors[path]) {
      formattedErrors[path] = [];
    }
    formattedErrors[path].push(err.message);
  });
  
  return formattedErrors;
}
