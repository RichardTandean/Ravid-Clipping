/**
 * Centralized Error Handler for Microservices
 * Handles different types of errors from distributed services with user-friendly messages
 */

export interface ServiceError {
  code: string;
  message: string;
  service: string;
  correlationId?: string;
  timestamp: Date;
  details?: any;
  retryable?: boolean;
  retryAfter?: number;
  userMessage?: string;
}

export interface ErrorContext {
  action: string;
  service: string;
  userId?: string;
  sessionId?: string;
  additionalData?: any;
}

export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface ErrorHandler {
  canHandle(error: any): boolean;
  handle(error: any, context: ErrorContext): ServiceError;
}

/**
 * Authentication Error Handler
 */
class AuthenticationErrorHandler implements ErrorHandler {
  canHandle(error: any): boolean {
    return error.status === 401 || 
           error.code === 'AUTH_FAILED' || 
           error.message?.includes('authentication') ||
           error.message?.includes('unauthorized');
  }

  handle(error: any, context: ErrorContext): ServiceError {
    return {
      code: 'AUTH_FAILED',
      message: 'Authentication failed',
      service: context.service,
      correlationId: error.correlationId,
      timestamp: new Date(),
      details: error,
      retryable: false,
      userMessage: 'Please log in again to continue.',
    };
  }
}

/**
 * Rate Limiting Error Handler
 */
class RateLimitErrorHandler implements ErrorHandler {
  canHandle(error: any): boolean {
    return error.status === 429 || 
           error.code === 'RATE_LIMIT_EXCEEDED' ||
           error.message?.includes('rate limit');
  }

  handle(error: any, context: ErrorContext): ServiceError {
    const retryAfter = error.retryAfter || 60;
    
    return {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Rate limit exceeded',
      service: context.service,
      correlationId: error.correlationId,
      timestamp: new Date(),
      details: error,
      retryable: true,
      retryAfter,
      userMessage: `Too many requests. Please wait ${retryAfter} seconds before trying again.`,
    };
  }
}

/**
 * Service Unavailable Error Handler
 */
class ServiceUnavailableErrorHandler implements ErrorHandler {
  canHandle(error: any): boolean {
    return error.status >= 500 || 
           error.code === 'SERVICE_UNAVAILABLE' ||
           error.message?.includes('service unavailable') ||
           error.message?.includes('connection refused');
  }

  handle(error: any, context: ErrorContext): ServiceError {
    return {
      code: 'SERVICE_UNAVAILABLE',
      message: `${context.service} service is currently unavailable`,
      service: context.service,
      correlationId: error.correlationId,
      timestamp: new Date(),
      details: error,
      retryable: true,
      retryAfter: 30,
      userMessage: 'The service is temporarily unavailable. Please try again in a moment.',
    };
  }
}

/**
 * Validation Error Handler
 */
class ValidationErrorHandler implements ErrorHandler {
  canHandle(error: any): boolean {
    return error.status === 400 || 
           error.code === 'VALIDATION_ERROR' ||
           error.message?.includes('validation') ||
           error.message?.includes('invalid');
  }

  handle(error: any, context: ErrorContext): ServiceError {
    const validationDetails = error.details || error.errors || [];
    const userFriendlyMessage = this.createUserFriendlyValidationMessage(validationDetails);
    
    return {
      code: 'VALIDATION_ERROR',
      message: 'Validation failed',
      service: context.service,
      correlationId: error.correlationId,
      timestamp: new Date(),
      details: error,
      retryable: false,
      userMessage: userFriendlyMessage,
    };
  }

  private createUserFriendlyValidationMessage(validationDetails: any[]): string {
    if (!Array.isArray(validationDetails) || validationDetails.length === 0) {
      return 'Please check your input and try again.';
    }

    const messages = validationDetails.map(detail => {
      if (typeof detail === 'string') return detail;
      if (detail.message) return detail.message;
      if (detail.field && detail.error) return `${detail.field}: ${detail.error}`;
      return 'Invalid input detected.';
    });

    return messages.slice(0, 3).join(' '); // Limit to first 3 validation errors
  }
}

/**
 * Job Processing Error Handler
 */
class JobProcessingErrorHandler implements ErrorHandler {
  canHandle(error: any): boolean {
    return error.code === 'JOB_FAILED' ||
           error.message?.includes('job failed') ||
           error.message?.includes('processing error');
  }

  handle(error: any, context: ErrorContext): ServiceError {
    const jobType = error.jobType || context.additionalData?.jobType || 'processing';
    
    return {
      code: 'JOB_PROCESSING_ERROR',
      message: `${jobType} job failed`,
      service: context.service,
      correlationId: error.correlationId,
      timestamp: new Date(),
      details: error,
      retryable: true,
      retryAfter: 10,
      userMessage: `${this.getJobTypeDisplayName(jobType)} failed. You can try again or contact support if the problem persists.`,
    };
  }

  private getJobTypeDisplayName(jobType: string): string {
    const displayNames: Record<string, string> = {
      'transcribe_video': 'Video transcription',
      'analyze_speech': 'AI analysis',
      'process_video': 'Video processing',
      'transcribe_with_timestamps': 'Subtitle generation',
      'upload_file': 'File upload',
    };
    
    return displayNames[jobType] || 'Processing';
  }
}

/**
 * File Processing Error Handler
 */
class FileProcessingErrorHandler implements ErrorHandler {
  canHandle(error: any): boolean {
    return error.code?.includes('FILE_') ||
           error.message?.includes('file') ||
           error.message?.includes('upload') ||
           error.message?.includes('storage');
  }

  handle(error: any, context: ErrorContext): ServiceError {
    let userMessage = 'File processing failed. Please try again.';
    
    if (error.message?.includes('too large')) {
      userMessage = 'File is too large. Please upload a smaller file.';
    } else if (error.message?.includes('format')) {
      userMessage = 'File format not supported. Please use a supported video format.';
    } else if (error.message?.includes('corrupt')) {
      userMessage = 'File appears to be corrupted. Please try a different file.';
    }
    
    return {
      code: 'FILE_PROCESSING_ERROR',
      message: 'File processing error',
      service: context.service,
      correlationId: error.correlationId,
      timestamp: new Date(),
      details: error,
      retryable: !error.message?.includes('format') && !error.message?.includes('corrupt'),
      userMessage,
    };
  }
}

/**
 * Network Error Handler
 */
class NetworkErrorHandler implements ErrorHandler {
  canHandle(error: any): boolean {
    return error.name === 'NetworkError' ||
           error.message?.includes('network') ||
           error.message?.includes('timeout') ||
           error.message?.includes('connection');
  }

  handle(error: any, context: ErrorContext): ServiceError {
    return {
      code: 'NETWORK_ERROR',
      message: 'Network connection error',
      service: context.service,
      correlationId: error.correlationId,
      timestamp: new Date(),
      details: error,
      retryable: true,
      retryAfter: 5,
      userMessage: 'Connection problem detected. Please check your internet connection and try again.',
    };
  }
}

/**
 * Generic Error Handler (fallback)
 */
class GenericErrorHandler implements ErrorHandler {
  canHandle(error: any): boolean {
    return true; // Handles any error not caught by specific handlers
  }

  handle(error: any, context: ErrorContext): ServiceError {
    return {
      code: 'UNKNOWN_ERROR',
      message: error.message || 'An unexpected error occurred',
      service: context.service,
      correlationId: error.correlationId,
      timestamp: new Date(),
      details: error,
      retryable: false,
      userMessage: 'Something went wrong. Please try again or contact support if the problem persists.',
    };
  }
}

/**
 * Main Error Handling Service
 */
export class ErrorHandlingService {
  private handlers: ErrorHandler[] = [
    new AuthenticationErrorHandler(),
    new RateLimitErrorHandler(),
    new ServiceUnavailableErrorHandler(),
    new ValidationErrorHandler(),
    new JobProcessingErrorHandler(),
    new FileProcessingErrorHandler(),
    new NetworkErrorHandler(),
    new GenericErrorHandler(), // Must be last (fallback)
  ];

  private errorLog: ServiceError[] = [];
  private subscribers = new Set<(error: ServiceError) => void>();

  /**
   * Handle an error and return a structured ServiceError
   */
  handleError(error: any, context: ErrorContext): ServiceError {
    // Find the appropriate handler
    const handler = this.handlers.find(h => h.canHandle(error));
    
    if (!handler) {
      throw new Error('No error handler found');
    }

    // Process the error
    const serviceError = handler.handle(error, context);
    
    // Log the error
    this.logError(serviceError, context);
    
    // Notify subscribers
    this.notifySubscribers(serviceError);
    
    return serviceError;
  }

  /**
   * Log error for monitoring and debugging
   */
  private logError(error: ServiceError, context: ErrorContext): void {
    console.error(`[${error.service}] ${error.code}: ${error.message}`, {
      error,
      context,
      timestamp: error.timestamp,
      correlationId: error.correlationId,
    });

    // Add to error log (keep last 100 errors)
    this.errorLog.push(error);
    if (this.errorLog.length > 100) {
      this.errorLog.shift();
    }

    // Send to monitoring service if in production
    if (process.env.NODE_ENV === 'production') {
      this.sendToMonitoring(error, context);
    }
  }

  /**
   * Send error to monitoring service
   */
  private async sendToMonitoring(error: ServiceError, context: ErrorContext): Promise<void> {
    try {
      // This would integrate with your monitoring service (e.g., Sentry, DataDog)
      const severity = this.getSeverity(error);
      
      // Example: Send to monitoring endpoint
      fetch('/api/monitoring/errors', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          error,
          context,
          severity,
          userAgent: navigator.userAgent,
          url: window.location.href,
        }),
      }).catch(monitoringError => {
        console.error('Failed to send error to monitoring:', monitoringError);
      });
    } catch (monitoringError) {
      console.error('Error in monitoring service:', monitoringError);
    }
  }

  /**
   * Determine error severity
   */
  private getSeverity(error: ServiceError): ErrorSeverity {
    if (error.code === 'AUTH_FAILED') return 'medium';
    if (error.code === 'SERVICE_UNAVAILABLE') return 'high';
    if (error.code === 'RATE_LIMIT_EXCEEDED') return 'low';
    if (error.code === 'VALIDATION_ERROR') return 'low';
    if (error.code === 'JOB_PROCESSING_ERROR') return 'medium';
    if (error.code === 'FILE_PROCESSING_ERROR') return 'medium';
    if (error.code === 'NETWORK_ERROR') return 'medium';
    return 'low';
  }

  /**
   * Subscribe to error notifications
   */
  subscribe(callback: (error: ServiceError) => void): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  /**
   * Notify subscribers of new errors
   */
  private notifySubscribers(error: ServiceError): void {
    this.subscribers.forEach(callback => {
      try {
        callback(error);
      } catch (error) {
        console.error('Error in error handler subscriber:', error);
      }
    });
  }

  /**
   * Get recent errors
   */
  getRecentErrors(count: number = 10): ServiceError[] {
    return this.errorLog.slice(-count);
  }

  /**
   * Get errors by service
   */
  getErrorsByService(service: string): ServiceError[] {
    return this.errorLog.filter(error => error.service === service);
  }

  /**
   * Clear error log
   */
  clearErrorLog(): void {
    this.errorLog = [];
  }

  /**
   * Retry a failed operation with exponential backoff
   */
  async retryOperation<T>(
    operation: () => Promise<T>,
    context: ErrorContext,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        const serviceError = this.handleError(error, context);
        
        // Don't retry if not retryable or on last attempt
        if (!serviceError.retryable || attempt === maxRetries) {
          throw serviceError;
        }

        // Calculate delay with exponential backoff
        const delay = serviceError.retryAfter ? 
          serviceError.retryAfter * 1000 : 
          baseDelay * Math.pow(2, attempt);
        
        console.log(`Retrying operation in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Should never reach here, but just in case
    throw this.handleError(lastError, context);
  }
}

// Global error handling service
let globalErrorHandler: ErrorHandlingService | null = null;

/**
 * Get or create global error handler
 */
export const getErrorHandler = (): ErrorHandlingService => {
  if (!globalErrorHandler) {
    globalErrorHandler = new ErrorHandlingService();
  }
  return globalErrorHandler;
};

/**
 * Utility function to handle errors in React components
 */
export const handleError = (error: any, context: ErrorContext): ServiceError => {
  return getErrorHandler().handleError(error, context);
};

/**
 * Utility function for retrying operations
 */
export const retryOperation = <T>(
  operation: () => Promise<T>,
  context: ErrorContext,
  maxRetries?: number,
  baseDelay?: number
): Promise<T> => {
  return getErrorHandler().retryOperation(operation, context, maxRetries, baseDelay);
}; 