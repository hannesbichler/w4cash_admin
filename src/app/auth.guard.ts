import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isConfigured() || auth.loggedIn()) {
    return true;
  }

  // Remember where the user was headed so signing in lands there rather than on the dashboard.
  auth.pendingUrl.set(state.url);
  return router.createUrlTree(['/']);
};

export const loginGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isConfigured()) {
    return router.parseUrl('/dashboard');
  }

  if (!auth.loggedIn()) {
    return true;
  }

  // Coming back from the Microsoft redirect the browser lands on '/', so the route the user
  // originally asked for is restored here.
  return router.parseUrl(auth.takeReturnUrl() ?? '/dashboard');
};
