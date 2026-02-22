# Booking Match Endpoint Implementation

Complete TypeScript implementation for `POST /api/v1/bookings/match` endpoint in the CareLink care services marketplace.

## Overview

This endpoint creates a new care service booking and finds matching providers within a 10km radius using PostGIS geospatial queries.

## File Structure

```
output/
├── types/
│   └── booking.types.ts          # TypeScript interfaces
├── validators/
│   └── booking.validator.ts      # Zod validation schemas
├── errors/
│   └── AppError.ts               # Custom error classes
├── services/
│   └── bookingMatch.service.ts   # Business logic & PostGIS queries
├── controllers/
│   └── bookingMatch.controller.ts # Express route handler
├── routes/
│   └── booking.routes.ts         # Route definitions
├── middleware/
│   └── errorHandler.middleware.ts # Global error handling
└── app.example.ts                # Example Express app setup
```

## API Specification

### Endpoint

```
POST /api/v1/bookings/match
```

### Request Body

```json
{
  "customerId": "uuid-string",
  "careRecipientName": "John Doe",
  "serviceCategorySlug": "hospital-attendant",
  "location": {
    "lat": 6.9271,
    "lng": 79.8612,
    "address": "Colombo General Hospital, Colombo 10"
  },
  "scheduledDate": "2024-03-15T08:00:00Z",
  "notes": "Needs assistance for 8 hours"
}
```

### Response (201 Created)

```json
{
  "success": true,
  "data": {
    "booking": {
      "id": "booking-uuid",
      "status": "PENDING",
      "careRecipientName": "John Doe",
      "location": { 
        "lat": 6.9271, 
        "lng": 79.8612, 
        "address": "Colombo General Hospital, Colombo 10" 
      },
      "scheduledDate": "2024-03-15T08:00:00Z",
      "createdAt": "2024-03-10T10:30:00Z"
    },
    "matchedProviders": [
      {
        "providerId": "provider-uuid",
        "fullName": "Jane Smith",
        "trustScore": 95.5,
        "yearsExperience": 3,
        "distanceKm": 2.4
      }
    ],
    "totalMatches": 5
  }
}
```

## Business Logic

1. **Validate Customer**: Verify customer exists and is active
2. **Validate Service Category**: Verify category exists and is active
3. **Create Booking**: Save booking with `PENDING` status
4. **Find Providers**: Execute PostGIS query to find providers:
   - Within 10km radius of booking location
   - Have verified skill for the service category
   - Are active providers
   - Sorted by trust score (descending)

## PostGIS Geospatial Query

```sql
SELECT 
  u.id AS provider_id,
  p.full_name,
  ps.skill_trust_score,
  ps.years_experience,
  ST_Distance(
    p.location::geography,
    ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography
  ) AS distance_meters
FROM "User" u
INNER JOIN "Profile" p ON p.user_id = u.id
INNER JOIN "ProviderSkill" ps ON ps.provider_id = u.id
WHERE 
  u.role = 'PROVIDER'
  AND u.is_active = true
  AND ps.service_category_id = $categoryId
  AND ps.is_verified = true
  AND p.location IS NOT NULL
  AND ST_DWithin(
    p.location::geography,
    ST_SetSRID(ST_MakePoint($lng, $lat), 4326)::geography,
    10000  -- 10km radius
  )
ORDER BY 
  ps.skill_trust_score DESC,
  distance_meters ASC
LIMIT 50
```

### PostGIS Functions Explained

| Function | Description |
|----------|-------------|
| `ST_SetSRID(ST_MakePoint(lng, lat), 4326)` | Creates a Point in WGS84 coordinate system |
| `ST_DWithin(geog1, geog2, distance)` | Checks if points are within distance (uses GIST index) |
| `ST_Distance(geog1, geog2)` | Calculates exact distance in meters |
| `::geography` | Casts geometry to geography for accurate distance calculations |

## Error Handling

| Status | Error Code | Description |
|--------|------------|-------------|
| 400 | `VALIDATION_ERROR` | Invalid input data |
| 404 | `CUSTOMER_NOT_FOUND` | Customer does not exist |
| 404 | `SERVICE_CATEGORY_NOT_FOUND` | Service category not found |
| 500 | `DATABASE_ERROR` | Database operation failed |
| 500 | `GEOSPATIAL_QUERY_ERROR` | PostGIS query failed |

## Installation

```bash
# Install dependencies
npm install express zod @prisma/client
npm install -D @types/express typescript

# Generate Prisma client
npx prisma generate
```

## Environment Variables

```bash
DATABASE_URL="postgresql://user:pass@localhost:5432/carelink?schema=public"
NODE_ENV=development
PORT=3000
```

## Database Setup

Ensure PostGIS extension is enabled:

```sql
-- Enable PostGIS
CREATE EXTENSION IF NOT EXISTS postgis;

-- Verify GIST index exists on Profile.location
CREATE INDEX IF NOT EXISTS "Profile_location_idx" 
ON "Profile" USING GIST (location);
```

## Testing

```bash
# Run the endpoint
curl -X POST http://localhost:3000/api/v1/bookings/match \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "550e8400-e29b-41d4-a716-446655440000",
    "careRecipientName": "John Doe",
    "serviceCategorySlug": "hospital-attendant",
    "location": {
      "lat": 6.9271,
      "lng": 79.8612,
      "address": "Colombo General Hospital"
    },
    "scheduledDate": "2024-03-15T08:00:00Z",
    "notes": "Needs assistance for 8 hours"
  }'
```

## Key Features

- ✅ **TypeScript** - Full type safety
- ✅ **Zod Validation** - Runtime input validation
- ✅ **PostGIS** - Efficient geospatial queries with GIST indexing
- ✅ **Custom Errors** - Typed error handling
- ✅ **Prisma ORM** - Type-safe database queries
- ✅ **Clean Architecture** - Separation of concerns (controller/service/validation)
