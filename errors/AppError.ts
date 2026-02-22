/**
 * Custom Error Classes for CareLink Application
 * Provides typed errors with HTTP status codes and error codes
 */

// ============================================================================
// Error Codes Enum
// ============================================================================

/**
 * Application-specific error codes for client-side handling
 */
export enum ErrorCode {
  // Validation Errors (400)
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  INVALID_INPUT = 'INVALID_INPUT',
  MISSING_REQUIRED_FIELD = 'MISSING_REQUIRED_FIELD',
  INVALID_COORDINATES = 'INVALID_COORDINATES',
  INVALID_DATE_FORMAT = 'INVALID_DATE_FORMAT',
  
  // Not Found Errors (404)
  CUSTOMER_NOT_FOUND = 'CUSTOMER_NOT_FOUND',
  PROVIDER_NOT_FOUND = 'PROVIDER_NOT_FOUND',
  SERVICE_CATEGORY_NOT_FOUND = 'SERVICE_CATEGORY_NOT_FOUND',
  BOOKING_NOT_FOUND = 'BOOKING_NOT_FOUND',
  
  // Conflict Errors (409)
  DUPLICATE_BOOKING = 'DUPLICATE_BOOKING',
  PROVIDER_UNAVAILABLE = 'PROVIDER_UNAVAILABLE',
  
  // Authentication/Authorization Errors (401/403)
  UNAUTHORIZED = 'UNAUTHORIZED',
  FORBIDDEN = 'FORBIDDEN',
  INVALID_TOKEN = 'INVALID_TOKEN',
  
  // Server Errors (500)
  INTERNAL_SERVER_ERROR = 'INTERNAL_SERVER_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  GEOSPATIAL_QUERY_ERROR = 'GEOSPATIAL_QUERY_ERROR',
}

// ============================================================================
// Base Application Error Class
// ============================================================================

/**
 * Base error class for all application errors
 * Extends Error with HTTP status code and error code
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly errorCode: ErrorCode;
  public readonly details?: Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number,
    errorCode: ErrorCode,
    details?: Record<string, unknown>,
    isOperational: boolean = true
  ) {
    super(message);
    
    // Maintain proper stack trace for where error was thrown
    Error.captureStackTrace(this, this.constructor);
    
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = isOperational;
    
    // Required for instanceof checks with TypeScript
    Object.setPrototypeOf(this, AppError.prototype);
  }

  /**
   * Serializes error for API response
   */
  toJSON(): {
    success: false;
    error: {
      code: string;
      message: string;
      details?: Record<string, unknown>;
    };
  } {
    return {
      success: false,
      error: {
        code: this.errorCode,
        message: this.message,
        ...(this.details && { details: this.details }),
      },
    };
  }
}

// ============================================================================
// Validation Error (400)
// ============================================================================

/**
 * Error for invalid input data
 * HTTP Status: 400 Bad Request
 */
export class ValidationError extends AppError {
  constructor(
    message: string = 'Validation failed',
    details?: Record<string, unknown>
  ) {
    super(message, 400, ErrorCode.VALIDATION_ERROR, details);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

// ============================================================================
// Not Found Errors (404)
// ============================================================================

/**
 * Error when a requested resource is not found
 * HTTP Status: 404 Not Found
 */
export class NotFoundError extends AppError {
  constructor(
    resource: string,
    identifier?: string
  ) {
    const message = identifier 
      ? `${resource} not found with identifier: ${identifier}`
      : `${resource} not found`;
    
    super(
      message,
      404,
      `${resource.toUpperCase().replace(/\s+/g, '_')}_NOT_FOUND` as ErrorCode,
      identifier ? { [resource.toLowerCase().replace(/\s+/g, '_') + 'Id']: identifier } : undefined
    );
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

/**
 * Specific error for customer not found
 */
export class CustomerNotFoundError extends AppError {
  constructor(customerId: string) {
    super(
      `Customer not found with ID: ${customerId}`,
      404,
      ErrorCode.CUSTOMER_NOT_FOUND,
      { customerId }
    );
    Object.setPrototypeOf(this, CustomerNotFoundError.prototype);
  }
}

/**
 * Specific error for service category not found
 */
export class ServiceCategoryNotFoundError extends AppError {
  constructor(slug: string) {
    super(
      `Service category not found with slug: ${slug}`,
      404,
      ErrorCode.SERVICE_CATEGORY_NOT_FOUND,
      { serviceCategorySlug: slug }
    );
    Object.setPrototypeOf(this, ServiceCategoryNotFoundError.prototype);
  }
}

// ============================================================================
// Conflict Errors (409)
// ============================================================================

/**
 * Error for resource conflicts
 * HTTP Status: 409 Conflict
 */
export class ConflictError extends AppError {
  constructor(
    message: string,
    errorCode: ErrorCode = ErrorCode.DUPLICATE_BOOKING,
    details?: Record<string, unknown>
  ) {
    super(message, 409, errorCode, details);
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

// ============================================================================
// Authentication/Authorization Errors (401/403)
// ============================================================================

/**
 * Error for unauthorized access
 * HTTP Status: 401 Unauthorized
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = 'Unauthorized access') {
    super(message, 401, ErrorCode.UNAUTHORIZED);
    Object.setPrototypeOf(this, UnauthorizedError.prototype);
  }
}

/**
 * Error for forbidden access
 * HTTP Status: 403 Forbidden
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Access forbidden') {
    super(message, 403, ErrorCode.FORBIDDEN);
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

// ============================================================================
// Database Errors (500)
// ============================================================================

/**
 * Error for database operation failures
 * HTTP Status: 500 Internal Server Error
 */
export class DatabaseError extends AppError {
  constructor(
    message: string = 'Database operation failed',
    details?: Record<string, unknown>
  ) {
    super(message, 500, ErrorCode.DATABASE_ERROR, details, false);
    Object.setPrototypeOf(this, DatabaseError.prototype);
  }
}

/**
 * Error for geospatial query failures
 * HTTP Status: 500 Internal Server Error
 */
export class GeospatialQueryError extends AppError {
  constructor(
    message: string = 'Geospatial query failed',
    details?: Record<string, unknown>
  ) {
    super(message, 500, ErrorCode.GEOSPATIAL_QUERY_ERROR, details, false);
    Object.setPrototypeOf(this, GeospatialQueryError.prototype);
  }
}

// ============================================================================
// Error Type Guards
// ============================================================================

/**
 * Type guard to check if error is an AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Type guard to check if error is an operational error (expected)
 */
export function isOperationalError(error: unknown): boolean {
  if (isAppError(error)) {
    return error.isOperational;
  }
  return false;
}
