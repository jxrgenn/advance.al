import crypto from 'crypto';

/**
 * Debug Logger with Trace Correlation
 *
 * Provides centralized debug logging with unique trace IDs for correlating
 * operations across the system. Can be toggled on/off via environment variables.
 *
 * Usage:
 *   const debugId = debugLogger.generateDebugId();
 *   debugLogger.log(debugId, 'info', 'EMBEDDING', 'generate_start', { jobId });
 *   debugLogger.log(debugId, 'success', 'EMBEDDING', 'generate_complete', { vector: vector.length });
 */

class DebugLogger {
  constructor() {
    // Read debug flags from environment
    this.debugEmbeddings = process.env.DEBUG_EMBEDDINGS === 'true';
    this.debugWorker = process.env.DEBUG_WORKER === 'true';
    this.debugQueue = process.env.DEBUG_QUEUE === 'true';
  }

  /**
   * Generate unique debug ID for tracing operations
   * @returns {string} 12-character hex string
   */
  generateDebugId() {
    return crypto.randomBytes(6).toString('hex');
  }

  /**
   * Check if logging is enabled for a category
   * @param {string} category - EMBEDDING, WORKER, QUEUE, etc.
   * @returns {boolean}
   */
  isEnabled(category) {
    switch (category) {
      case 'EMBEDDING':
        return this.debugEmbeddings;
      case 'WORKER':
        return this.debugWorker;
      case 'QUEUE':
        return this.debugQueue;
      default:
        return false;
    }
  }

  /**
   * Log a debug message
   * @param {string} debugId - Unique trace ID
   * @param {string} level - info, success, warning, error
   * @param {string} category - EMBEDDING, WORKER, QUEUE, etc.
   * @param {string} operation - Operation name (e.g., 'generate_start')
   * @param {Object} data - Additional data to log
   */
  log(debugId, level, category, operation, data = {}) {
    // Check if debugging is enabled for this category
    if (!this.isEnabled(category)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const levelEmoji = this.getLevelEmoji(level);
    const prefix = `[${timestamp}] ${levelEmoji} [${debugId}] [${category}] [${operation}]`;

    // Format the data for logging
    const dataStr = Object.keys(data).length > 0 ? JSON.stringify(data, null, 2) : '';

    // Color code by level (for terminal output)
    const coloredPrefix = this.colorize(prefix, level);

    console.log(`${coloredPrefix} ${dataStr}`);
  }

  /**
   * Log operation start
   */
  start(debugId, category, operation, data = {}) {
    this.log(debugId, 'info', category, `${operation}_start`, data);
  }

  /**
   * Log operation success
   */
  success(debugId, category, operation, data = {}) {
    this.log(debugId, 'success', category, `${operation}_complete`, data);
  }

  /**
   * Log operation error
   */
  error(debugId, category, operation, error, data = {}) {
    this.log(debugId, 'error', category, `${operation}_error`, {
      ...data,
      error: error?.message || String(error),
      stack: error?.stack
    });
  }

  /**
   * Log operation warning
   */
  warning(debugId, category, operation, message, data = {}) {
    this.log(debugId, 'warning', category, `${operation}_warning`, {
      ...data,
      message
    });
  }

  /**
   * Get emoji for log level
   */
  getLevelEmoji(level) {
    const emojis = {
      info: 'ℹ️',
      success: '✅',
      warning: '⚠️',
      error: '❌'
    };
    return emojis[level] || 'ℹ️';
  }

  /**
   * Colorize console output (ANSI colors for terminal)
   */
  colorize(text, level) {
    // Don't colorize in production or if NO_COLOR env var is set
    if (process.env.NODE_ENV === 'production' || process.env.NO_COLOR) {
      return text;
    }

    const colors = {
      info: '\x1b[36m',    // Cyan
      success: '\x1b[32m', // Green
      warning: '\x1b[33m', // Yellow
      error: '\x1b[31m'    // Red
    };

    const reset = '\x1b[0m';
    const color = colors[level] || colors.info;

    return `${color}${text}${reset}`;
  }

  /**
   * Measure operation duration
   * @param {string} debugId
   * @param {string} category
   * @param {string} operation
   * @param {Function} fn - Async function to measure
   * @returns {Promise<any>} Result of fn
   */
  async measure(debugId, category, operation, fn) {
    const startTime = Date.now();

    this.start(debugId, category, operation);

    try {
      const result = await fn();
      const duration = Date.now() - startTime;

      this.success(debugId, category, operation, { duration_ms: duration });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.error(debugId, category, operation, error, { duration_ms: duration });

      throw error;
    }
  }

  /**
   * Create a scoped logger for a specific operation
   * @param {string} category - EMBEDDING, WORKER, etc.
   * @returns {Object} Scoped logger with debugId
   */
  scope(category) {
    const debugId = this.generateDebugId();

    return {
      debugId,
      start: (operation, data) => this.start(debugId, category, operation, data),
      success: (operation, data) => this.success(debugId, category, operation, data),
      error: (operation, error, data) => this.error(debugId, category, operation, error, data),
      warning: (operation, message, data) => this.warning(debugId, category, operation, message, data),
      log: (level, operation, data) => this.log(debugId, level, category, operation, data),
      measure: (operation, fn) => this.measure(debugId, category, operation, fn)
    };
  }

  /**
   * Toggle debugging for a category
   */
  toggle(category, enabled) {
    switch (category) {
      case 'EMBEDDING':
        this.debugEmbeddings = enabled;
        break;
      case 'WORKER':
        this.debugWorker = enabled;
        break;
      case 'QUEUE':
        this.debugQueue = enabled;
        break;
    }
  }

  /**
   * Get current debug status
   */
  getStatus() {
    return {
      embeddings: this.debugEmbeddings,
      worker: this.debugWorker,
      queue: this.debugQueue
    };
  }
}

// Singleton instance
const debugLogger = new DebugLogger();

export default debugLogger;
