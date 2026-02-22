/**
 * Global Error Handler Middleware
 * Catches all errors and formats them for API responses
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError, isAppError, ErrorCode } from '../errors/AppError';

// ============================================================================
// Error Response Types
// ============================================================================

interface ErrorResponse {
  success: false;
  error: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    stack?: string;
  };
}

// ============================================================================
// Global Error Handler
// ============================================================================

/**
 * Global error handling middleware
 * Should be registered AFTER all routes in the Express app
 * 
 * Usage:
 * ```typescript
 * import express from 'express';
 * import { globalErrorHandler } from './middleware/errorHandler.middleware';
 * 
 * const app = express();
 * 
 * // ... routes ...
 * 
 * // Register error handler last
 * app.use(globalErrorHandler);
 * ```
 */
export function globalErrorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Default error values
  let statusCode = 500;
  let errorCode = ErrorCode.INTERNAL_SERVER_ERROR;
  let message = 'An unexpected error occurred';
  let details: Record<string, unknown> | undefined;

  // ========================================================================
  // Handle Known Error Types
  // ========================================================================

  // AppError (our custom error types)
  if (isAppError(err)) {
    statusCode = err.statusCode;
    errorCode = err.errorCode;
    message = err.message;
    details = err.details;
  }
  // Zod Validation Errors
  else if (err instanceof ZodError) {
    statusCode = 400;
    errorCode = ErrorCode.VALIDATION_ERROR;
    message = 'Request validation failed';
    details = {
      validationErrors: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    };
  }
  // Prisma Known Request Errors (e.g., record not found)
  else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2002': // Unique constraint violation
        statusCode = 409;
        errorCode = ErrorCode.DUPLICATE_BOOKING;
        message = 'A record with this information already exists';
        details = { target: err.meta?.target };
        break;
      
      case 'P2025': // Record not found
        statusCode = 404;
        errorCode = ErrorCode.BOOKING_NOT_FOUND;
        message = 'Record not found';
        break;
      
      case 'P2003': // Foreign key constraint failed
        statusCode = 400;
        errorCode = ErrorCode.INVALID_INPUT;
        message = 'Referenced record does not exist';
        details = { field: err.meta?.field_name };
        break;
      
      default:
        statusCode = 500;
        errorCode = ErrorCode.DATABASE_ERROR;
        message = 'Database operation failed';
        details = { prismaCode: err.code };
    }
  }
  // Prisma Validation Errors
  else if (err instanceof Prisma.PrismaClientValidationError) {
    statusCode = 400;
    errorCode = ErrorCode.VALIDATION_ERROR;
    message = 'Invalid data provided';
  }
  // Prisma Connection/Timeout Errors
  else if (
    err instanceof Prisma.PrismaClientInitializationError ||
    err instanceof Prisma.PrismaClientRustPanicError
  ) {
    statusCode = 500;
    errorCode = ErrorCode.DATABASE_ERROR;
    message = 'Database connection error';
  }
  // Generic Error
  else if (err instanceof Error) {
    message = err.message;
  }

  // ========================================================================
  // Build Error Response
  // ========================================================================

  const errorResponse: ErrorResponse = {
    success: false,
    error: {
      code: errorCode,
      message,
      ...(details && { details }),
      // Include stack trace in development only
      ...(process.env.NODE_ENV === 'development' && {
        stack: err.stack,
      }),
    },
  };

  // ========================================================================
  // Log Error
  // ========================================================================

  // Log operational errors at warn level
  if (statusCode < 500) {
    console.warn(`[${req.method} ${req.path}] ${statusCode} - ${errorCode}: ${message}`);
  }
  // Log server errors at error level with full stack
  else {
    console.error(`[${req.method} ${req.path}] ${statusCode} - ${errorCode}:`, err);
  }

  // ========================================================================
  // Send Response
  // ========================================================================

  res.status(statusCode).json(errorResponse);
}

// ============================================================================
// 404 Not Found Handler
// ============================================================================

/**
 * Middleware to handle 404 Not Found for undefined routes
 * Should be registered BEFORE the global error handler
 */
export function notFoundHandler(
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCode.BOOKING_NOT_FOUND,
      message: `Route ${req.method} ${req.path} not found`,
    },
  });
}

// ============================================================================
// Unhandled Promise Rejection Handler
// ============================================================================

/**
 * Setup handlers for uncaught exceptions and unhandled rejections
 * Should be called at application startup
 */
export function setupUnhandledErrorHandlers(): void {
  // Handle uncaught exceptions
  process.on('uncaughtException', (err: Error) => {
    console.error('UNCAUGHT EXCEPTION! Shutting down...', err);
    process.exit(1);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (reason: unknown) => {
    console.error('UNHANDLED REJECTION! Shutting down...', reason);
    process.exit(1);
  });
}
