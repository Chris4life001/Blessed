/**
 * Typed application error hierarchy.
 *
 * Throw these anywhere in route / middleware code; the global error handler
 * in middlewares/errorHandler.ts maps them to the correct HTTP status code.
 */
export class AppError extends Error {
  readonly statusCode: number;
  /** true = expected error that doesn't require a stack trace in prod logs */
  readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  readonly errors?: Array<{ field?: string; message: string }>;
  constructor(
    message: string,
    errors?: Array<{ field?: string; message: string }>,
  ) {
    super(message, 422);
    this.errors = errors;
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, 403);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "Not found") {
    super(message, 404);
  }
}

export class ConflictError extends AppError {
  constructor(message = "Conflict") {
    super(message, 409);
  }
}

export class DatabaseError extends AppError {
  constructor(message = "Database unavailable") {
    super(message, 503, false);
  }
}
