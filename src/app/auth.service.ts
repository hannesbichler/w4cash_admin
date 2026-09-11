import { Injectable, signal } from '@angular/core';
import {
  PublicClientApplication,
  InteractionRequiredAuthError,
  type AuthenticationResult,
  type AccountInfo,
} from '@azure/msal-browser';
import { environment } from '../environments/environment';

/** Where to send the user once the sign-in redirect lands back on the app. */
const RETURN_URL_KEY = 'w4cash.auth.returnUrl';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private pca: PublicClientApplication;

  /** Resolves once MSAL is initialized and any redirect response has been consumed. */
  private ready: Promise<void> | null = null;

  loggedIn = signal(false);
  userName = signal('');

  /** Route a guard turned away while signed out, replayed once the sign-in redirect returns. */
  pendingUrl = signal<string | null>(null);

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
  }

  isConfigured(): boolean {
    return environment.authEnabled && !!environment.msal.clientId && environment.msal.clientId !== 'YOUR_CLIENT_ID';
  }

  /**
   * MSAL v3+ refuses every call until initialize() has run, and the redirect response has to be
   * consumed before the router picks a route - otherwise the guard still sees a logged-out app on
   * the way back from Microsoft. Run once, from an app initializer.
   */
  initialize(): Promise<void> {
    if (!this.ready) {
      this.ready = this.runInitialize();
    }
    return this.ready;
  }

  private async runInitialize(): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    try {
      await this.pca.initialize();
      const result = await this.pca.handleRedirectPromise();
      if (result) {
        this.applyResult(result);
      } else {
        this.syncSessionState();
      }
    } catch (err) {
      console.error('Microsoft sign-in failed', err);
      this.clearSessionState();
    }
  }

  /** Path to restore after the sign-in redirect, or null when there is nothing pending. */
  takeReturnUrl(): string | null {
    const url = sessionStorage.getItem(RETURN_URL_KEY);
    sessionStorage.removeItem(RETURN_URL_KEY);
    return url;
  }

  /** Leaves the page: the browser navigates to Microsoft and comes back into initialize(). */
  async login(returnUrl = this.pendingUrl() ?? '/dashboard'): Promise<void> {
    if (!this.isConfigured()) {
      console.warn('Microsoft authentication is not configured. Update src/environments/environment.ts.');
      return;
    }

    await this.initialize();
    sessionStorage.setItem(RETURN_URL_KEY, returnUrl);

    await this.pca.loginRedirect({
      scopes: environment.msal.scopes,
      prompt: 'select_account'
    });
  }

  async logout(): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    await this.initialize();
    const account = this.activeAccount();
    this.clearSessionState();

    if (account) {
      await this.pca.logoutRedirect({ account });
    }
  }

  async acquireToken(): Promise<string | null> {
    if (!this.isConfigured()) {
      return null;
    }

    await this.initialize();

    const account = this.activeAccount();
    if (!account) {
      this.clearSessionState();
      return null;
    }

    try {
      const result = await this.pca.acquireTokenSilent({
        account,
        scopes: environment.msal.scopes
      });
      this.applyResult(result);
      return result.accessToken;
    } catch (err) {
      // The silent refresh is the only place a stale session shows up; sending the user back
      // through Microsoft is what re-establishes it.
      if (err instanceof InteractionRequiredAuthError) {
        this.clearSessionState();
      }
      return null;
    }
  }

  private activeAccount(): AccountInfo | null {
    return this.pca.getActiveAccount() ?? this.pca.getAllAccounts()[0] ?? null;
  }

  private syncSessionState() {
    const account = this.activeAccount();
    if (account) {
      this.pca.setActiveAccount(account);
      this.loggedIn.set(true);
      this.userName.set(account.name ?? account.username ?? 'Microsoft user');
    } else {
      this.clearSessionState();
    }
  }

  private clearSessionState() {
    this.pca.setActiveAccount(null);
    this.loggedIn.set(false);
    this.userName.set('');
  }

  private applyResult(result: AuthenticationResult) {
    if (result.account) {
      this.pca.setActiveAccount(result.account);
    }
    this.loggedIn.set(true);
    this.userName.set(result.account?.name ?? result.account?.username ?? 'Microsoft user');
  }
}
