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
      background: radial-gradient(circle at top, #ffffff 0%, #edf4ff 32%, #dfeaff 100%);
      padding: 24px;
    }
    .login-card {
      width: min(440px, 100%);
      background: rgba(255, 255, 255, 0.9);
      border: 1px solid rgba(58, 111, 255, 0.12);
      border-radius: 22px;
      box-shadow: 0 24px 60px rgba(39, 74, 180, 0.16);
      padding: 28px 28px 24px;
      text-align: left;
      backdrop-filter: blur(8px);
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
      background: linear-gradient(135deg, #3a6fff, #6b8cff);
      color: #fff;
      font-size: 1.2rem;
      font-weight: 800;
      box-shadow: 0 10px 18px rgba(58, 111, 255, 0.25);
    }
    .brand-name {
      font-size: 1.1rem;
      font-weight: 800;
      color: #1a1a2e;
      line-height: 1.1;
    }
    .brand-subtitle {
      font-size: 0.72rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: #7584af;
    }
    .login-badge {
      display: inline-block;
      margin-bottom: 14px;
      padding: 6px 10px;
      background: #e9f0ff;
      color: #2959e8;
      border-radius: 999px;
      font-size: 0.72rem;
      font-weight: 700;
      letter-spacing: 0.05em;
      text-transform: uppercase;
    }
    h1 {
      margin: 0 0 10px;
      font-size: clamp(2rem, 4vw, 2.5rem);
      color: #1a1a2e;
      line-height: 1.1;
    }
    p {
      margin: 0 0 24px;
      color: #5d6787;
      line-height: 1.6;
    }
    .login-button {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 10px;
      width: 100%;
      border: none;
      background: #3a6fff;
      color: white;
      border-radius: 12px;
      padding: 13px 18px;
      font: inherit;
      font-weight: 700;
      cursor: pointer;
      box-shadow: 0 10px 18px rgba(58, 111, 255, 0.2);
    }
    .login-button:hover {
      background: #2d5ef2;
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
