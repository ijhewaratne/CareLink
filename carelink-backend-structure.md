# CareLink Backend - Folder Structure

```
carelink-backend/
├── src/
│   ├── config/                    // Environment & application configuration
│   │   ├── database.ts            // Database connection setup
│   │   ├── firebase.ts            // Firebase Admin SDK configuration
│   │   ├── redis.ts               // Redis cache configuration
│   │   ├── swagger.ts             // API documentation config
│   │   └── env.ts                 // Environment variable validation
│   │
│   ├── modules/                   // Feature-based module organization
│   │   ├── auth/                  // Authentication module
│   │   │   ├── auth.controller.ts
│   │   │   ├── auth.service.ts
│   │   │   ├── auth.routes.ts
│   │   │   ├── auth.validation.ts
│   │   │   └── types/
│   │   │       └── auth.types.ts
│   │   │
│   │   ├── users/                 // User management module
│   │   │   ├── user.controller.ts
│   │   │   ├── user.service.ts
│   │   │   ├── user.routes.ts
│   │   │   ├── user.validation.ts
│   │   │   └── types/
│   │   │       └── user.types.ts
│   │   │
│   │   ├── attendants/            // Attendant/Bystander module (Phase 1 core)
│   │   │   ├── attendant.controller.ts
│   │   │   ├── attendant.service.ts
│   │   │   ├── attendant.routes.ts
│   │   │   ├── attendant.validation.ts
│   │   │   └── types/
│   │   │       └── attendant.types.ts
│   │   │
│   │   ├── bookings/              // Service booking module
│   │   │   ├── booking.controller.ts
│   │   │   ├── booking.service.ts
│   │   │   ├── booking.routes.ts
│   │   │   ├── booking.validation.ts
│   │   │   └── types/
│   │   │       └── booking.types.ts
│   │   │
│   │   ├── payments/              // Payment processing module
│   │   │   ├── payment.controller.ts
│   │   │   ├── payment.service.ts
│   │   │   ├── payment.routes.ts
│   │   │   ├── payment.validation.ts
│   │   │   └── types/
│   │   │       └── payment.types.ts
│   │   │
│   │   ├── reviews/               // Rating & review module
│   │   │   ├── review.controller.ts
│   │   │   ├── review.service.ts
│   │   │   ├── review.routes.ts
│   │   │   └── types/
│   │   │       └── review.types.ts
│   │   │
│   │   ├── notifications/         // Push/SMS notification module
│   │   │   ├── notification.controller.ts
│   │   │   ├── notification.service.ts
│   │   │   ├── notification.routes.ts
│   │   │   └── types/
│   │   │       └── notification.types.ts
│   │   │
│   │   └── admin/                 // Admin dashboard module
│   │       ├── admin.controller.ts
│   │       ├── admin.service.ts
│   │       ├── admin.routes.ts
│   │       ├── admin.validation.ts
│   │       └── types/
│   │           └── admin.types.ts
│   │
│   ├── routes/                    // API route aggregation
│   │   ├── v1/                    // Version 1 API routes
│   │   │   ├── index.ts           // v1 route aggregator
│   │   │   ├── public.routes.ts   // Public/unauthenticated routes
│   │   │   └── admin.routes.ts    // Admin-only routes
│   │   └── api.routes.ts          // Main API router entry
│   │
│   ├── middleware/                // Express middleware
│   │   ├── auth/                  // Authentication middleware
│   │   │   ├── firebaseAuth.ts    // Firebase token verification
│   │   │   ├── requireAuth.ts     // Authentication guard
│   │   │   └── requireRole.ts     // Role-based access control
│   │   │
│   │   ├── validation/            // Request validation middleware
│   │   │   ├── validateRequest.ts
│   │   │   └── sanitizeInput.ts
│   │   │
│   │   ├── error/                 // Error handling middleware
│   │   │   ├── errorHandler.ts
│   │   │   └── notFound.ts
│   │   │
│   │   ├── security/              // Security middleware
│   │   │   ├── rateLimiter.ts     // API rate limiting
│   │   │   ├── helmet.ts          // Security headers
│   │   │   └── cors.ts            // CORS configuration
│   │   │
│   │   └── logging/               // Request logging middleware
│   │       ├── requestLogger.ts
│   │       └── auditLogger.ts
│   │
│   ├── utils/                     // Utility functions
│   │   ├── geospatial/            // Location-based utilities
│   │   │   ├── distance.ts        // Haversine distance calculation
│   │   │   ├── geocode.ts         // Address geocoding
│   │   │   ├── sriLankaZones.ts   // Sri Lankan district/zone data
│   │   │   └── types/
│   │   │       └── geo.types.ts
│   │   │
│   │   ├── security/              // Security utilities
│   │   │   ├── encryption.ts      // Data encryption/decryption
│   │   │   ├── hash.ts            // Password hashing
│   │   │   ├── jwt.ts             // JWT token utilities
│   │   │   └── sanitizers.ts      // Input sanitization
│   │   │
│   │   ├── storage/               // File storage utilities
│   │   │   ├── s3.ts              // AWS S3 / DigitalOcean Spaces
│   │   │   ├── localStorage.ts    // Local file storage (dev)
│   │   │   └── fileValidator.ts   // File type/size validation
│   │   │
│   │   ├── sms/                   // SMS gateway utilities
│   │   │   ├── twilio.ts          // Twilio integration
│   │   │   └── notifyLK.ts        // Sri Lankan SMS provider
│   │   │
│   │   ├── email/                 // Email utilities
│   │   │   ├── sendgrid.ts
│   │   │   └── templates/
│   │   │       ├── bookingConfirmation.ts
│   │   │       └── welcomeEmail.ts
│   │   │
│   │   ├── helpers/               // General helper functions
│   │   │   ├── dateHelpers.ts
│   │   │   ├── stringHelpers.ts
│   │   │   └── responseHelpers.ts
│   │   │
│   │   └── logger/                // Application logging
│   │       ├── winston.ts
│   │       └── logLevels.ts
│   │
│   ├── prisma/                    // Database layer
│   │   ├── schema.prisma          // Prisma schema definition
│   │   ├── migrations/            // Database migrations
│   │   ├── seeders/               // Database seed data
│   │   │   ├── users.seeder.ts
│   │   │   ├── attendants.seeder.ts
│   │   │   └── locations.seeder.ts
│   │   └── client.ts              // Prisma client singleton
│   │
│   ├── types/                     // Global TypeScript types
│   │   ├── express.d.ts           // Express type extensions
│   │   ├── api.types.ts           // Common API response types
│   │   ├── enums.ts               // Shared enums
│   │   └── index.ts
│   │
│   ├── constants/                 // Application constants
│   │   ├── httpStatus.ts          // HTTP status codes
│   │   ├── userRoles.ts           // User role definitions
│   │   ├── bookingStatus.ts       // Booking state machine
│   │   ├── sriLankaDistricts.ts   // Sri Lankan location data
│   │   └── appConstants.ts        // General app constants
│   │
│   ├── services/                  // External service integrations
│   │   ├── firebase/              // Firebase services
│   │   │   ├── auth.service.ts
│   │   │   ├── fcm.service.ts     // Firebase Cloud Messaging
│   │   │   └── storage.service.ts
│   │   │
│   │   ├── payment/               // Payment gateway
│   │   │   ├── payhere.ts         // PayHere (Sri Lanka)
│   │   │   └── stripe.ts          // Stripe integration
│   │   │
│   │   └── maps/                  // Map services
│   │       ├── googleMaps.ts
│   │       └── osrm.ts            // OpenStreetMap routing
│   │
│   ├── jobs/                      // Background job processors
│   │   ├── queues/                // Bull/Redis queue definitions
│   │   │   ├── bookingQueue.ts
│   │   │   ├── notificationQueue.ts
│   │   │   └── paymentQueue.ts
│   │   ├── workers/               // Job workers
│   │   │   ├── bookingWorker.ts
│   │   │   └── notificationWorker.ts
│   │   └── schedulers/            // Cron jobs
│   │       └── reminderScheduler.ts
│   │
│   ├── app.ts                     // Express app configuration
│   └── server.ts                  // Server entry point
│
├── tests/                         // Test suites
│   ├── unit/                      // Unit tests
│   │   ├── modules/
│   │   │   ├── auth/
│   │   │   │   └── auth.service.test.ts
│   │   │   ├── users/
│   │   │   │   └── user.service.test.ts
│   │   │   └── attendants/
│   │   │       └── attendant.service.test.ts
│   │   ├── utils/
│   │   │   ├── geospatial.test.ts
│   │   │   └── security.test.ts
│   │   └── middleware/
│   │       └── auth.middleware.test.ts
│   │
│   ├── integration/               // Integration tests
│   │   ├── api/
│   │   │   ├── auth.api.test.ts
│   │   │   ├── users.api.test.ts
│   │   │   └── bookings.api.test.ts
│   │   └── database/
│   │       └── prisma.test.ts
│   │
│   ├── fixtures/                  // Test data fixtures
│   │   ├── users.fixture.ts
│   │   ├── attendants.fixture.ts
│   │   └── bookings.fixture.ts
│   │
│   ├── helpers/                   // Test utilities
│   │   ├── testDatabase.ts
│   │   ├── testServer.ts
│   │   └── mockFirebase.ts
│   │
│   └── setup.ts                   // Jest test setup
│
├── docs/                          // Documentation
│   ├── api/                       // API documentation
│   │   ├── openapi.yaml           // OpenAPI/Swagger spec
│   │   └── postman/
│   │       └── CareLink.postman_collection.json
│   │
│   ├── architecture/              // System architecture docs
│   │   ├── database-schema.md
│   │   ├── api-design.md
│   │   └── deployment.md
│   │
│   └── guides/                    // Developer guides
│       ├── setup.md
│       ├── testing.md
│       └── deployment-guide.md
│
├── scripts/                       // Utility scripts
│   ├── db/                        // Database scripts
│   │   ├── migrate.sh
│   │   ├── seed.sh
│   │   └── reset.sh
│   │
│   ├── deploy/                    // Deployment scripts
│   │   └── deploy-production.sh
│   │
│   └── dev/                       // Development scripts
│       └── start-dev.sh
│
├── prisma/                        // Prisma root (alternative location)
│   └── (can mirror src/prisma or be primary)
│
├── public/                        // Static files (if needed)
│   └── uploads/                   // Temporary upload directory
│
├── .env.example                   // Environment template
├── .env.test                      // Test environment
├── .env.production                // Production environment (git-ignored)
├── .eslintrc.json                 // ESLint configuration
├── .prettierrc                    // Prettier configuration
├── jest.config.js                 // Jest test configuration
├── tsconfig.json                  // TypeScript configuration
├── docker-compose.yml             // Local development services
├── Dockerfile                     // Production container
├── .dockerignore                  // Docker ignore rules
├── .gitignore                     // Git ignore rules
├── package.json                   // Dependencies & scripts
├── package-lock.json              // Lock file
└── README.md                      // Project documentation
```

## Directory Purpose Summary

| Directory | Purpose |
|-----------|---------|
| `src/config/` | Centralized configuration for database, Firebase, Redis, and environment variables |
| `src/modules/` | **Feature-based organization** - Each module contains controller, service, routes, validation, and types for a specific domain |
| `src/routes/` | API versioning (`/api/v1/`) with separate public and admin route aggregators |
| `src/middleware/` | Reusable Express middleware organized by concern (auth, validation, error, security, logging) |
| `src/utils/` | Shared utilities: geospatial (Sri Lanka-specific), security, storage, SMS, email |
| `src/prisma/` | Database schema, migrations, seeders, and Prisma client |
| `src/types/` | Global TypeScript type definitions and Express extensions |
| `src/constants/` | Application-wide constants (roles, status codes, Sri Lankan districts) |
| `src/services/` | External service integrations (Firebase, PayHere, Google Maps) |
| `src/jobs/` | Background job processing with Bull queues and cron schedulers |
| `tests/` | Comprehensive test suite: unit, integration, fixtures, and helpers |
| `docs/` | API docs (OpenAPI), architecture diagrams, and developer guides |
| `scripts/` | Automation scripts for database, deployment, and development |

## Key Architectural Decisions

1. **Feature-Based Modules**: Each domain (auth, users, attendants, bookings) is self-contained with its own controller, service, routes, and types
2. **API Versioning**: `/api/v1/` structure allows future versioning without breaking changes
3. **Separation of Concerns**: Clear boundaries between public APIs, admin APIs, middleware, and utilities
4. **Sri Lanka Specific**: Dedicated geospatial utilities for Sri Lankan districts and PayHere payment integration
5. **Security First**: Dedicated security utilities folder with encryption, hashing, and sanitization
6. **Scalable Testing**: Separate unit and integration test suites with fixtures and helpers
