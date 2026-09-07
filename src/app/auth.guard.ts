import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.loggedIn()) {
    return true;
  }

  return router.createUrlTree(['/']);
};

export const loginGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.loggedIn()) {
    return true;
  }

  return router.createUrlTree(['/dashboard']);
};
