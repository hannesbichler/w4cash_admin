import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { from } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { AuthService } from './auth.service';

export const msalHttpInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(AuthService);

  if (!req.url.startsWith('/api') || !auth.isConfigured()) {
    return next(req);
  }

  return from(auth.acquireToken()).pipe(
    switchMap(token => token
      ? next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }))
      : next(req)
    ),
    catchError(() => next(req))
  );
};
