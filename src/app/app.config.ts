import { ApplicationConfig, LOCALE_ID, provideBrowserGlobalErrorListeners } from '@angular/core';
import { registerLocaleData } from '@angular/common';
import localeDeAt from '@angular/common/locales/de-AT';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './routes';
import { storedLang } from './i18n.service';
import { msalHttpInterceptor } from './msal-http.interceptor';

registerLocaleData(localeDeAt);

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideHttpClient(withInterceptors([msalHttpInterceptor])),
    provideRouter(routes),
    // The date/number pipes read LOCALE_ID once at bootstrap, so switching the language in the
    // header retranslates the text immediately but reformats numbers and dates on next load.
    { provide: LOCALE_ID, useFactory: () => (storedLang() === 'de' ? 'de-AT' : 'en-US') },
  ]
};
