import {
  ApplicationConfig,
  LOCALE_ID,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDeAt from '@angular/common/locales/de-AT';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './routes';
import { storedLang } from './i18n.service';
import { msalHttpInterceptor } from './msal-http.interceptor';
import { AuthService } from './auth.service';

registerLocaleData(localeDeAt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    // MSAL has to finish reading the sign-in redirect before the router runs a guard, otherwise
    // the app bounces a freshly signed-in user straight back to the login page.
    provideAppInitializer(() => inject(AuthService).initialize()),
    provideHttpClient(withInterceptors([msalHttpInterceptor])),
    provideRouter(routes),
    // The date/number pipes read LOCALE_ID once at bootstrap, so switching the language in the
    // header retranslates the text immediately but reformats numbers and dates on next load.
    { provide: LOCALE_ID, useFactory: () => (storedLang() === 'de' ? 'de-AT' : 'en-US') },
  ]
};
