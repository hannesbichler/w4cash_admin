import { Component, inject } from '@angular/core';
import { AuthService } from './auth.service';

@Component({
  selector: 'app-login-page',
  standalone: true,
  template: `
    <div class="login-page">
      <div class="login-card">
        <div class="login-brand">
          <div class="brand-mark">W</div>
          <div>
            <div class="brand-name">W4Cash</div>
            <div class="brand-subtitle">Admin Portal</div>
          </div>
        </div>

        <div class="login-badge">Secure access</div>
        <h1>Welcome back</h1>
        <p>Sign in with your Microsoft account to continue to the admin dashboard.</p>

        <button type="button" class="login-button" (click)="signIn()">
          <span class="ms-logo" aria-hidden="true">M</span>
          Sign in with Microsoft
        </button>
      </div>
    </div>
  `,
  styles: `
    :host { display: block; width: 100%; height: 100%; }
    .login-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: linear-gradient(160deg, var(--ground) 0%, var(--border-strong) 100%);
      padding: 24px;
    }
    .login-card {
      width: min(440px, 100%);
      background: var(--surface);
      border: 1px solid var(--border-strong);
      border-radius: 16px;
      box-shadow: 0 20px 50px rgb(var(--shadow-rgb) / .12);
      padding: 28px 28px 24px;
      text-align: left;
    }
    .login-brand {
      display: flex;
      align-items: center;
      gap: 14px;
      margin-bottom: 20px;
    }
    .brand-mark {
      width: 42px;
      height: 42px;
      border-radius: 12px;
      display: grid;
      place-items: center;
      background: var(--accent);
      color: var(--surface);
      font-size: 1.2rem;
      font-weight: 800;
    }
    .brand-name {
      font-size: 1.1rem;
      font-weight: 800;
      color: var(--text);
      line-height: 1.1;
    }
    .brand-subtitle {
      font-size: 0.72rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-subtle);
    }
    .login-badge {
      display: inline-block;
      margin-bottom: 14px;
      padding: 6px 10px;
      background: var(--hover);
      color: var(--text-muted);
      border: 1px solid var(--border-strong);
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0 0 10px;
      font-size: clamp(2rem, 4vw, 2.5rem);
      color: var(--text);
      line-height: 1.1;
    }
    p {
      margin: 0 0 24px;
      color: var(--text-muted);
      line-height: 1.6;
    }
    .login-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      border: none;
      background: var(--accent);
      color: var(--surface);
      border-radius: 12px;
      padding: 13px 18px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 10px 18px rgb(var(--shadow-rgb) / .2);
    }
    .login-button:hover {
      background: var(--accent-hover);
    }
    .ms-logo {
      display: inline-grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 6px;
      background: rgba(255,255,255,0.18);
      font-size: 0.9rem;
      font-weight: 800;
    }
  `
})
export class LoginPage {
  private auth = inject(AuthService);

  // The browser leaves for Microsoft here; the app picks the session back up on the way in,
  // from the initializer, so there is nothing to navigate to on this side.
  signIn() {
    this.auth.login();
  }
}
