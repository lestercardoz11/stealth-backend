const logger = require('../config/logger');
const constants = require('../config/constants');

// Custom error classes
class AppError extends Error {
  constructor(message, statusCode, isOperational = true) {
    super(message);
    this.statusCode = statusCode;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

    Error.captureStackTrace(this, this.constructor);
  }
}

class ValidationError extends AppError {
  constructor(message, details = []) {
    super(message, constants.HTTP_STATUS.BAD_REQUEST);
    this.details = details;
  }
}

class AuthenticationError extends AppError {
  constructor(message = 'Authentication failed') {
    super(message, constants.HTTP_STATUS.UNAUTHORIZED);
  }
}

class AuthorizationError extends AppError {
  constructor(message = 'Access forbidden') {
    super(message, constants.HTTP_STATUS.FORBIDDEN);
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, constants.HTTP_STATUS.NOT_FOUND);
  }
}

class RateLimitError extends AppError {
  constructor(message = 'Rate limit exceeded') {
    super(message, constants.HTTP_STATUS.TOO_MANY_REQUESTS);
  }
}

// Async error wrapper
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Development error response
const sendErrorDev = (err, res) => {
  res.status(err.statusCode).json({
    status: err.status,
    error: err,
    message: err.message,
    stack: err.stack,
    timestamp: new Date().toISOString(),
  });
};

// Production error response
const sendErrorProd = (err, res) => {
  // Operational, trusted error: send message to client
  if (err.isOperational) {
    res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      timestamp: new Date().toISOString(),
    });
  } else {
    // Programming or other unknown error: don't leak error details
    logger.error('Unexpected error', {
      error: err,
      stack: err.stack,
    });

    res.status(constants.HTTP_STATUS.INTERNAL_SERVER_ERROR).json({
      status: 'error',
      message: 'Something went wrong!',
      timestamp: new Date().toISOString(),
    });
  }
};

// Handle specific error types
const handleCastErrorDB = (err) => {
  const message = `Invalid ${err.path}: ${err.value}`;
  return new AppError(message, constants.HTTP_STATUS.BAD_REQUEST);
};

const handleDuplicateFieldsDB = (err) => {
  const value = err.errmsg.match(/(["'])(\\?.)*?\1/)[0];
  const message = `Duplicate field value: ${value}. Please use another value!`;
  return new AppError(message, constants.HTTP_STATUS.BAD_REQUEST);
};

const handleValidationErrorDB = (err) => {
  const errors = Object.values(err.errors).map(el => el.message);
  const message = `Invalid input data. ${errors.join('. ')}`;
  return new ValidationError(message, errors);
};

const handleJWTError = () =>
  new AuthenticationError('Invalid token. Please log in again!');

const handleJWTExpiredError = () =>
  new AuthenticationError('Your token has expired! Please log in again.');

// Global error handling middleware
const globalErrorHandler = (err, req, res, next) => {
  err.statusCode = err.statusCode || constants.HTTP_STATUS.INTERNAL_SERVER_ERROR;
  err.status = err.status || 'error';

  // Log error
  logger.error('Error occurred', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent'),
    userId: req.user?.id,
  });

  if (constants.SERVER.NODE_ENV === 'development') {
    sendErrorDev(err, res);
  } else {
    let error = { ...err };
    error.message = err.message;

    // Handle specific error types
    if (error.name === 'CastError') error = handleCastErrorDB(error);
    if (error.code === 11000) error = handleDuplicateFieldsDB(error);
    if (error.name === 'ValidationError') error = handleValidationErrorDB(error);
    if (error.name === 'JsonWebTokenError') error = handleJWTError();
    if (error.name === 'TokenExpiredError') error = handleJWTExpiredError();

    sendErrorProd(error, res);
  }
};

// 404 handler
const notFoundHandler = (req, res, next) => {
  const err = new NotFoundError(`Can't find ${req.originalUrl} on this server!`);
  next(err);
};

// Unhandled promise rejection handler
process.on('unhandledRejection', (err, promise) => {
  logger.error('Unhandled Promise Rejection', {
    error: err.message,
    stack: err.stack,
  });
  
  // Close server & exit process
  process.exit(1);
});

// Uncaught exception handler
process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception', {
    error: err.message,
    stack: err.stack,
  });
  
  // Close server & exit process
  process.exit(1);
});

module.exports = {
  AppError,
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  RateLimitError,
  asyncHandler,
  globalErrorHandler,
  notFoundHandler,
};