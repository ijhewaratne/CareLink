/**
 * Booking Routes Configuration
 * Express router for booking-related endpoints
 */

import { Router } from 'express';
import { createBookingMatchHandler } from '../controllers/bookingMatch.controller';

// ============================================================================
// Router Setup
// ============================================================================

const router = Router();

// ============================================================================
// Routes
// ============================================================================

/**
 * POST /api/v1/bookings/match
 * 
 * Creates a new booking and finds matching providers within 10km radius.
 * 
 * Authentication: Required (JWT)
 * 
 * Request Body:
 * {
 *   "customerId": "uuid-string",
 *   "careRecipientName": "John Doe",
 *   "serviceCategorySlug": "hospital-attendant",
 *   "location": {
 *     "lat": 6.9271,
 *     "lng": 79.8612,
 *     "address": "Colombo General Hospital, Colombo 10"
 *   },
 *   "scheduledDate": "2024-03-15T08:00:00Z",
 *   "notes": "Needs assistance for 8 hours"
 * }
 * 
 * Success Response (201):
 * {
 *   "success": true,
 *   "data": {
 *     "booking": {
 *       "id": "booking-uuid",
 *       "status": "PENDING",
 *       "careRecipientName": "John Doe",
 *       "location": { "lat": 6.9271, "lng": 79.8612, "address": "..." },
 *       "scheduledDate": "2024-03-15T08:00:00Z"
 *     },
 *     "matchedProviders": [...],
 *     "totalMatches": 5
 *   }
 * }
 * 
 * Error Responses:
 * - 400: Validation error - Invalid input data
 * - 401: Unauthorized - Missing or invalid JWT token
 * - 404: Customer not found or Service category not found
 * - 500: Internal server error
 */
router.post('/match', createBookingMatchHandler);

// ============================================================================
// Additional Routes (for future implementation)
// ============================================================================

/**
 * GET /api/v1/bookings/:id
 * Get booking details by ID
 */
// router.get('/:id', getBookingByIdHandler);

/**
 * PATCH /api/v1/bookings/:id/status
 * Update booking status (e.g., PENDING -> MATCHED)
 */
// router.patch('/:id/status', updateBookingStatusHandler);

/**
 * GET /api/v1/bookings
 * List bookings for authenticated user
 */
// router.get('/', listBookingsHandler);

/**
 * POST /api/v1/bookings/:id/accept
 * Provider accepts a booking
 */
// router.post('/:id/accept', acceptBookingHandler);

/**
 * POST /api/v1/bookings/:id/cancel
 * Cancel a booking
 */
// router.post('/:id/cancel', cancelBookingHandler);

// ============================================================================
// Export
// ============================================================================

export default router;
