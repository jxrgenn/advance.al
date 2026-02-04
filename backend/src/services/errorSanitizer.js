/**
 * Error Sanitizer Service
 *
 * Cleans error messages before storing in database or sending to users.
 * Removes sensitive information like API keys, tokens, file paths, etc.
 */

class ErrorSanitizer {
  /**
   * Sanitize error for storage/display
   * @param {Error|string} error
   * @returns {string} Sanitized error message
   */
  sanitize(error) {
    let message = error?.message || String(error);

    // Remove API keys
    message = message.replace(/sk-[a-zA-Z0-9]{20,}/g, 'sk-***');
    message = message.replace(/Bearer [a-zA-Z0-9._-]+/gi, 'Bearer ***');

    // Remove file paths
    message = message.replace(/\/[a-zA-Z0-9_\-/.]+\/[a-zA-Z0-9_\-/.]+/g, '[PATH]');
    message = message.replace(/[A-Z]:\\[a-zA-Z0-9_\-\\/.]+/g, '[PATH]');

    // Remove email addresses
    message = message.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[EMAIL]');

    // Remove IP addresses
    message = message.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP]');

    // Remove MongoDB connection strings
    message = message.replace(/mongodb(\+srv)?:\/\/[^\s]+/gi, 'mongodb://[REDACTED]');

    // Remove JWT tokens
    message = message.replace(/eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/g, '[JWT]');

    // Truncate if too long
    if (message.length > 500) {
      message = message.substring(0, 500) + '... [truncated]';
    }

    return message;
  }

  /**
   * Sanitize error for user display (more aggressive)
   * @param {Error|string} error
   * @returns {string} User-friendly error message
   */
  sanitizeForUser(error) {
    let message = this.sanitize(error);

    // Replace technical errors with user-friendly messages
    const replacements = {
      'ECONNREFUSED': 'Service temporarily unavailable',
      'ETIMEDOUT': 'Request timed out, please try again',
      'ENOTFOUND': 'Service not found',
      'timeout': 'Request timed out, please try again',
      'Rate limit': 'Too many requests, please try again later',
      'Invalid API key': 'Configuration error, please contact support',
      'Unauthorized': 'Authentication failed',
      'forbidden': 'Access denied'
    };

    for (const [technical, friendly] of Object.entries(replacements)) {
      if (message.toLowerCase().includes(technical.toLowerCase())) {
        message = friendly;
        break;
      }
    }

    return message;
  }

  /**
   * Get error type from error object
   * @param {Error} error
   * @returns {string}
   */
  getErrorType(error) {
    if (!error) return 'UNKNOWN';

    // Network errors
    if (error.code === 'ECONNREFUSED') return 'CONNECTION_REFUSED';
    if (error.code === 'ETIMEDOUT') return 'TIMEOUT';
    if (error.code === 'ENOTFOUND') return 'NOT_FOUND';

    // OpenAI errors
    if (error.status === 429 || error.message?.includes('Rate limit')) return 'RATE_LIMIT';
    if (error.status === 401 || error.message?.includes('Invalid API key')) return 'INVALID_API_KEY';
    if (error.status === 400) return 'BAD_REQUEST';

    // Database errors
    if (error.name === 'MongoError') return 'DATABASE_ERROR';
    if (error.name === 'ValidationError') return 'VALIDATION_ERROR';

    // Timeout errors
    if (error.name === 'TimeoutError' || error.message?.includes('timeout')) return 'TIMEOUT';

    // Generic
    if (error.name) return error.name.toUpperCase();

    return 'UNKNOWN';
  }

  /**
   * Check if error is retryable
   * @param {Error} error
   * @returns {boolean}
   */
  isRetryable(error) {
    const retryableTypes = [
      'TIMEOUT',
      'RATE_LIMIT',
      'CONNECTION_REFUSED',
      'NOT_FOUND',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND'
    ];

    const errorType = this.getErrorType(error);
    return retryableTypes.includes(errorType);
  }

  /**
   * Create standardized error response
   * @param {Error} error
   * @param {string} context - Where the error occurred
   * @returns {Object}
   */
  createErrorResponse(error, context = 'operation') {
    return {
      success: false,
      error: {
        message: this.sanitizeForUser(error),
        type: this.getErrorType(error),
        context,
        retryable: this.isRetryable(error)
      }
    };
  }

  /**
   * Log error safely (for debugging)
   * @param {Error} error
   * @param {Object} context
   */
  logError(error, context = {}) {
    console.error('ERROR:', {
      message: this.sanitize(error),
      type: this.getErrorType(error),
      retryable: this.isRetryable(error),
      context,
      stack: error?.stack?.split('\n').slice(0, 5).join('\n') // First 5 lines of stack
    });
  }
}

// Singleton instance
const errorSanitizer = new ErrorSanitizer();

export default errorSanitizer;
