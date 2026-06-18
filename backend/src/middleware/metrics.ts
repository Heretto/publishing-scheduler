import { Request, Response, NextFunction } from 'express';
import { httpRequestDuration, httpRequestTotal, httpRequestErrors } from '../metrics';

export function metricsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  // Extract route pattern (not the actual URL with params)
  const route = req.route?.path || req.path;

  // Listen for response finish
  res.on('finish', () => {
    const duration = (Date.now() - startTime) / 1000; // Convert to seconds
    const statusCode = res.statusCode;
    const method = req.method;

    // Record metrics
    httpRequestDuration.observe(
      { method, route, status_code: statusCode },
      duration,
    );

    httpRequestTotal.inc({
      method,
      route,
      status_code: statusCode,
    });

    // Track errors (4xx and 5xx)
    if (statusCode >= 400) {
      const errorType = statusCode >= 500 ? 'server_error' : 'client_error';
      httpRequestErrors.inc({
        method,
        route,
        error_type: errorType,
      });
    }
  });

  next();
}
