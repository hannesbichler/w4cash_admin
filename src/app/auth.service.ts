import { Injectable, signal } from '@angular/core';
import { from, of } from 'rxjs';
import { catchError, switchMap } from 'rxjs/operators';
import { PublicClientApplication, type AuthenticationResult } from '@azure/msal-browser';
import { environment } from '../environments/environment';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private pca: PublicClientApplication;

  loggedIn = signal(false);
  userName = signal('');

  constructor() {
    this.pca = new PublicClientApplication({
      auth: {
        clientId: environment.msal.clientId || '00000000-0000-0000-0000-000000000000',
        authority: environment.msal.tenantId
          ? `https://login.microsoftonline.com/${environment.msal.tenantId}`
          : 'https://login.microsoftonline.com/common',
        redirectUri: environment.msal.redirectUri || window.location.origin,
        postLogoutRedirectUri: environment.msal.redirectUri || window.location.origin,
      },
      cache: {
        cacheLocation: 'sessionStorage'
      }
    });

    this.syncSessionState();
  }

  isConfigured(): boolean {
    return !!environment.msal.clientId && environment.msal.clientId !== 'YOUR_CLIENT_ID';
  }

  async login(): Promise<void> {
    if (!this.isConfigured()) {
      console.warn('Microsoft authentication is not configured. Update src/environments/environment.ts.');
      return;
    }

    const result = await this.pca.loginPopup({
      scopes: environment.msal.scopes,
      prompt: 'select_account'
    });

    this.applyResult(result);
  }

  async logout(): Promise<void> {
    const accounts = this.pca.getAllAccounts();
    if (accounts.length) {
      await this.pca.logoutPopup({ account: accounts[0] });
    }
    this.loggedIn.set(false);
    this.userName.set('');
    this.pca.setActiveAccount(null);
  }

  acquireToken(): Promise<string | null> {
    if (!this.isConfigured()) {
      return Promise.resolve(null);
    }

    const accounts = this.pca.getAllAccounts();
    if (!accounts.length) {
      this.loggedIn.set(false);
      this.userName.set('');
      return Promise.resolve(null);
    }

    return this.pca.acquireTokenSilent({
      account: accounts[0],
      scopes: environment.msal.scopes
    }).then(result => {
      this.applyResult(result);
      return result.accessToken;
    }).catch(() => {
      this.loggedIn.set(false);
      this.userName.set('');
      return null;
    });
  }

  private syncSessionState() {
    const accounts = this.pca.getAllAccounts();
    if (accounts.length) {
      this.loggedIn.set(true);
      this.userName.set(accounts[0].name ?? accounts[0].username ?? 'Microsoft user');
    }
  }

  private applyResult(result: AuthenticationResult) {
    this.loggedIn.set(true);
    this.userName.set(result.account?.name ?? result.account?.username ?? 'Microsoft user');
  }
}

export function microsoftAuthInterceptor(req: any, next: any) {
  const auth = new AuthService();

  if (!req.url.startsWith('/api')) {
    return next(req);
  }

  if (!auth.isConfigured()) {
    return next(req);
  }

  return from(auth.acquireToken()).pipe(
    switchMap(token => token ? next(req.clone({ setHeaders: { Authorization: `Bearer ${token}` } })) : next(req)),
    catchError(() => next(req))
  );
}
