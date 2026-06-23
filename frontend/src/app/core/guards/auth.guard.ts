import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { from, map, switchMap, of, catchError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isLoggedIn$.value) {
    return of(true);
  }

  // Try to restore session from HttpOnly refresh cookie
  return auth.refresh().pipe(
    map(() => true),
    catchError(() => {
      router.navigate(['/login']);
      return of(false);
    }),
  );
};
