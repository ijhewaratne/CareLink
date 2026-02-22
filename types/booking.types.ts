/**
 * TypeScript Type Definitions for Booking Match Endpoint
 * CareLink - Location-aware care services marketplace
 */

import { BookingStatus } from '@prisma/client';

// ============================================================================
// Request Types
// ============================================================================

/**
 * Location data for booking
 */
export interface BookingLocation {
  lat: number;
  lng: number;
  address?: string;
}

/**
 * POST /api/v1/bookings/match Request Body
 */
export interface CreateBookingMatchRequest {
  customerId: string;
  careRecipientName: string;
  serviceCategorySlug: string;
  location: BookingLocation;
  scheduledDate: string; // ISO 8601 format
  notes?: string;
}

// ============================================================================
// Response Types
// ============================================================================

/**
 * Simplified booking response for match endpoint
 */
export interface BookingResponse {
  id: string;
  status: BookingStatus;
  careRecipientName: string;
  location: BookingLocation;
  scheduledDate: string;
  notes?: string;
  createdAt: string;
}

/**
 * Matched provider information
 */
export interface MatchedProvider {
  providerId: string;
  fullName: string;
  trustScore: number;
  yearsExperience: number;
  distanceKm: number;
}

/**
 * Successful match response
 */
export interface BookingMatchResponse {
  success: true;
  data: {
    booking: BookingResponse;
    matchedProviders: MatchedProvider[];
    totalMatches: number;
  };
}

/**
 * Error response structure
 */
export interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
}

// ============================================================================
// Database Query Result Types
// ============================================================================

/**
 * Raw result from PostGIS geospatial query
 */
export interface ProviderMatchRawResult {
  provider_id: string;
  full_name: string;
  skill_trust_score: number;
  years_experience: number;
  distance_meters: number;
}

/**
 * Service category lookup result
 */
export interface ServiceCategoryLookup {
  id: string;
  name: string;
  slug: string;
}
