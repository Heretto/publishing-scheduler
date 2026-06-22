import { HttpInterceptorFn, HttpErrorResponse, HttpRequest, HttpHandlerFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';
import { NotificationService } from '../services/notification.service';

let isRefreshing = false;

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const notifications = inject(NotificationService);

  // Attach Bearer token if we have one in memory
  const authedReq = auth.accessToken
    ? req.clone({
        setHeaders: { Authorization: `Bearer ${auth.accessToken}` },
        withCredentials: true,
      })
    : req.clone({ withCredentials: true });

  return next(authedReq).pipe(
    catchError((error: HttpErrorResponse) => {
      // 401 on a non-auth endpoint → try refresh
      if (error.status === 401 && !_isAuthEndpoint(req.url)) {
        if (isRefreshing) {
          auth['_clearSession']();
          router.navigate(['/login']);
          return throwError(() => error);
        }

        isRefreshing = true;

        return auth.refresh().pipe(
          switchMap(() => {
            isRefreshing = false;
            // Retry original request with the new token
            const retried = req.clone({
              setHeaders: { Authorization: `Bearer ${auth.accessToken}` },
              withCredentials: true,
            });
            return next(retried);
          }),
          catchError(refreshErr => {
            isRefreshing = false;
            router.navigate(['/login']);
            return throwError(() => refreshErr);
          }),
        );
      }

      // Surface user-readable error messages
      const message = _errorMessage(error);
      if (message) notifications.error(message);

      return throwError(() => error);
    }),
  );
};

function _isAuthEndpoint(url: string): boolean {
  return url.includes('/auth/') || url.includes('/invitations/');
}

function _errorMessage(error: HttpErrorResponse): string | null {
  if (error.status === 0) return 'Unable to connect to the server';
  if (error.status === 400) return error.error?.detail || error.error?.error || 'Invalid request';
  if (error.status === 401) return null; // handled by redirect
  if (error.status === 403) return 'You do not have permission to perform this action';
  if (error.status === 404) return 'Resource not found';
  if (error.status === 409) return error.error?.detail || 'Conflict — a job may already be running';
  if (error.status === 502) return 'Heretto API is unreachable';
  if (error.status >= 500) return error.error?.detail || error.error?.error || 'Server error';
  return null;
}
