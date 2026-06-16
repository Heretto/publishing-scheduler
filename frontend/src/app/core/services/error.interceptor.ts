import { HttpInterceptorFn, HttpErrorResponse } from '@angular/common/http';
import { catchError, throwError } from 'rxjs';
import { inject } from '@angular/core';
import { NotificationService } from './notification.service';

export const errorInterceptor: HttpInterceptorFn = (req, next) => {
  const notifications = inject(NotificationService);

  return next(req).pipe(
    catchError((error: HttpErrorResponse) => {
      let message = 'An unexpected error occurred';

      if (error.status === 0) {
        message = 'Unable to connect to the server';
      } else if (error.status === 400) {
        message = error.error?.error || 'Invalid request';
      } else if (error.status === 404) {
        message = 'Resource not found';
      } else if (error.status === 502) {
        message = 'Heretto API is unreachable';
      } else if (error.status >= 500) {
        message = error.error?.error || 'Server error';
      }

      notifications.error(message);
      return throwError(() => error);
    }),
  );
};
