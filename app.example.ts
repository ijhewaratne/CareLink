/**
 * Example Express Application Setup
 * Shows how to wire together all components for the booking match endpoint
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import bookingRoutes from './routes/booking.routes';
import {
  globalErrorHandler,
  notFoundHandler,
  setupUnhandledErrorHandlers,
} from './middleware/errorHandler.middleware';

// ============================================================================
// Application Setup
// ============================================================================

const app: Application = express();

// Setup global error handlers for uncaught exceptions
setupUnhandledErrorHandlers();

// ============================================================================
// Middleware
// ============================================================================

// Security headers
app.use(helmet());

// CORS configuration
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
}));

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ============================================================================
// Health Check
// ============================================================================

app.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
    },
  });
});

// ============================================================================
// API Routes
// ============================================================================

// Mount booking routes at /api/v1/bookings
app.use('/api/v1/bookings', bookingRoutes);

// ============================================================================
// Error Handling
// ============================================================================

// 404 handler for undefined routes
app.use(notFoundHandler);

// Global error handler (must be last)
app.use(globalErrorHandler);

// ============================================================================
// Server Startup
// ============================================================================

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
});

export default app;
