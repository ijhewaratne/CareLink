/**
 * Booking Match Service
 * Handles the business logic for creating bookings and finding matching providers
 * Uses PostGIS for geospatial radius searches
 */

import { PrismaClient, BookingStatus, UserRole } from '@prisma/client';
import {
  CreateBookingMatchInput,
  BookingResponse,
  MatchedProvider,
  ProviderMatchRawResult,
  ServiceCategoryLookup,
} from '../types/booking.types';
import {
  AppError,
  CustomerNotFoundError,
  ServiceCategoryNotFoundError,
  DatabaseError,
  GeospatialQueryError,
} from '../errors/AppError';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Search radius in meters (10km)
 */
const SEARCH_RADIUS_METERS = 10000;

/**
 * Maximum number of providers to return
 */
const MAX_PROVIDERS = 50;

// ============================================================================
// Prisma Client
// ============================================================================

// In production, this would be imported from a shared database module
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error'],
});

// ============================================================================
// Service Interface
// ============================================================================

/**
 * Result of the booking match operation
 */
export interface BookingMatchResult {
  booking: BookingResponse;
  matchedProviders: MatchedProvider[];
  totalMatches: number;
}

// ============================================================================
// Main Service Function
// ============================================================================

/**
 * Creates a new booking and finds matching providers within radius
 * 
 * Business Logic:
 * 1. Validate customer exists and is active
 * 2. Validate service category exists
 * 3. Create booking record with PENDING status
 * 4. Execute PostGIS geospatial query to find providers within 10km
 * 5. Sort results by trust score (descending)
 * 6. Return booking and matched providers
 * 
 * @param input - Validated booking match request
 * @returns Booking match result with matched providers
 * @throws AppError for validation failures or database errors
 */
export async function createBookingAndFindMatches(
  input: CreateBookingMatchInput
): Promise<BookingMatchResult> {
  // Destructure input for clarity
  const {
    customerId,
    careRecipientName,
    serviceCategorySlug,
    location,
    scheduledDate,
    notes,
  } = input;

  try {
    // ========================================================================
    // Step 1: Validate Customer Exists
    // ========================================================================
    const customer = await prisma.user.findUnique({
      where: { id: customerId },
      select: { id: true, isActive: true, role: true },
    });

    if (!customer) {
      throw new CustomerNotFoundError(customerId);
    }

    if (!customer.isActive) {
      throw new AppError(
        'Customer account is inactive',
        400,
        ErrorCode.CUSTOMER_NOT_FOUND,
        { customerId, reason: 'Account inactive' }
      );
    }

    // ========================================================================
    // Step 2: Validate Service Category Exists
    // ========================================================================
    const serviceCategory = await prisma.serviceCategory.findUnique({
      where: { slug: serviceCategorySlug },
      select: { id: true, name: true, slug: true, isActive: true },
    });

    if (!serviceCategory) {
      throw new ServiceCategoryNotFoundError(serviceCategorySlug);
    }

    if (!serviceCategory.isActive) {
      throw new AppError(
        'Service category is currently inactive',
        400,
        ErrorCode.SERVICE_CATEGORY_NOT_FOUND,
        { serviceCategorySlug, reason: 'Category inactive' }
      );
    }

    // ========================================================================
    // Step 3: Create Booking Record
    // ========================================================================
    const scheduledDateObj = new Date(scheduledDate);
    
    const booking = await prisma.booking.create({
      data: {
        customerId,
        serviceCategoryId: serviceCategory.id,
        status: BookingStatus.PENDING,
        careRecipientName,
        locationLat: location.lat,
        locationLng: location.lng,
        locationAddress: location.address,
        scheduledDate: scheduledDateObj,
        notes: notes || null,
      },
    });

    // ========================================================================
    // Step 4: Find Matching Providers with PostGIS Geospatial Query
    // ========================================================================
    const matchedProviders = await findMatchingProviders(
      serviceCategory.id,
      location.lat,
      location.lng,
      SEARCH_RADIUS_METERS,
      MAX_PROVIDERS
    );

    // ========================================================================
    // Step 5: Format and Return Response
    // ========================================================================
    return {
      booking: formatBookingResponse(booking),
      matchedProviders,
      totalMatches: matchedProviders.length,
    };

  } catch (error) {
    // Re-throw known AppErrors
    if (error instanceof AppError) {
      throw error;
    }

    // Log and wrap unknown errors
    console.error('Booking match service error:', error);
    throw new DatabaseError(
      'Failed to create booking and find matches',
      { originalError: (error as Error).message }
    );
  }
}

// ============================================================================
// Geospatial Provider Matching
// ============================================================================

/**
 * Finds matching providers using PostGIS geospatial query
 * 
 * Query Logic:
 * - Joins Profile, User, ProviderSkill, and ServiceCategory tables
 * - Filters for verified providers with the required skill
 * - Uses ST_DWithin for efficient radius search (uses GIST index)
 * - Calculates exact distance using ST_Distance
 * - Orders by trust score (descending) then by distance (ascending)
 * 
 * PostGIS Functions Used:
 * - ST_SetSRID(ST_MakePoint(lng, lat), 4326): Creates a Point geometry in WGS84
 * - ST_DWithin(geog1, geog2, distance): Checks if points are within distance (uses index)
 * - ST_Distance(geog1, geog2): Calculates exact distance in meters
 * 
 * @param serviceCategoryId - The service category ID to match
 * @param lat - Booking location latitude
 * @param lng - Booking location longitude
 * @param radiusMeters - Search radius in meters
 * @param limit - Maximum results to return
 * @returns Array of matched providers with distance
 */
async function findMatchingProviders(
  serviceCategoryId: string,
  lat: number,
  lng: number,
  radiusMeters: number,
  limit: number
): Promise<MatchedProvider[]> {
  try {
    /**
     * Raw SQL Query with PostGIS Geospatial Search
     * 
     * Explanation:
     * 1. ST_SetSRID(ST_MakePoint($3, $2), 4326) creates the booking location point
     * 2. ST_DWithin uses the GIST index on profile.location for fast filtering
     * 3. ST_Distance calculates exact distance for the response
     * 4. Results are ordered by trust score (highest first) then by distance
     */
    const query = `
      SELECT 
        u.id AS provider_id,
        p.full_name,
        ps.skill_trust_score,
        ps.years_experience,
        ST_Distance(
          p.location::geography,
          ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography
        ) AS distance_meters
      FROM "User" u
      INNER JOIN "Profile" p ON p.user_id = u.id
      INNER JOIN "ProviderSkill" ps ON ps.provider_id = u.id
      WHERE 
        u.role = 'PROVIDER'
        AND u.is_active = true
        AND ps.service_category_id = $1
        AND ps.is_verified = true
        AND p.location IS NOT NULL
        AND ST_DWithin(
          p.location::geography,
          ST_SetSRID(ST_MakePoint($3, $2), 4326)::geography,
          $4
        )
      ORDER BY 
        ps.skill_trust_score DESC,
        distance_meters ASC
      LIMIT $5
    `;

    // Execute raw query with parameterized values
    const results = await prisma.$queryRawUnsafe<ProviderMatchRawResult[]>(
      query,
      serviceCategoryId,
      lat,
      lng,
      radiusMeters,
      limit
    );

    // Map raw results to typed response
    return results.map((row) => ({
      providerId: row.provider_id,
      fullName: row.full_name,
      trustScore: Math.round(row.skill_trust_score * 10) / 10, // Round to 1 decimal
      yearsExperience: row.years_experience,
      distanceKm: Math.round((row.distance_meters / 1000) * 10) / 10, // Convert to km, round to 1 decimal
    }));

  } catch (error) {
    console.error('Geospatial query error:', error);
    throw new GeospatialQueryError(
      'Failed to execute provider matching query',
      { lat, lng, serviceCategoryId, radiusMeters }
    );
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Formats a Prisma Booking into the API response format
 */
function formatBookingResponse(booking: {
  id: string;
  status: BookingStatus;
  careRecipientName: string;
  locationLat: number;
  locationLng: number;
  locationAddress: string | null;
  scheduledDate: Date;
  notes: string | null;
  createdAt: Date;
}): BookingResponse {
  return {
    id: booking.id,
    status: booking.status,
    careRecipientName: booking.careRecipientName,
    location: {
      lat: booking.locationLat,
      lng: booking.locationLng,
      address: booking.locationAddress || undefined,
    },
    scheduledDate: booking.scheduledDate.toISOString(),
    notes: booking.notes || undefined,
    createdAt: booking.createdAt.toISOString(),
  };
}

// ============================================================================
// Additional Service Functions (for future use)
// ============================================================================

/**
 * Gets a booking by ID with full details
 */
export async function getBookingById(bookingId: string) {
  return prisma.booking.findUnique({
    where: { id: bookingId },
    include: {
      customer: {
        select: {
          id: true,
          phone: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
      provider: {
        select: {
          id: true,
          phone: true,
          profile: {
            select: {
              fullName: true,
            },
          },
        },
      },
      serviceCategory: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
    },
  });
}

/**
 * Updates booking status
 */
export async function updateBookingStatus(
  bookingId: string,
  status: BookingStatus,
  providerId?: string
) {
  return prisma.booking.update({
    where: { id: bookingId },
    data: {
      status,
      ...(providerId && { providerId }),
    },
  });
}

// Re-export ErrorCode for convenience
import { ErrorCode } from '../errors/AppError';
export { ErrorCode };
