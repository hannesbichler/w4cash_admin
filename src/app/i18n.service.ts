import { Injectable, signal } from '@angular/core';
import { Lang, LANGS, TRANSLATIONS } from './translations';

const STORAGE_KEY = 'w4cash-admin.lang';
const DEFAULT_LANG: Lang = 'de';

export function storedLang(): Lang {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    if (value && (LANGS as string[]).includes(value)) return value as Lang;
  } catch {
    // localStorage is unavailable in private mode / when site data is blocked
  }
  return DEFAULT_LANG;
}

@Injectable({ providedIn: 'root' })
export class I18nService {
  readonly lang = signal<Lang>(storedLang());

  // Arrow function so a component can expose it directly as `t = inject(I18nService).t`
  // and templates stay short: {{ t('products.code') }}. Reading lang() inside makes every
  // interpolation re-evaluate when the language changes.
  readonly t = (key: string, params?: Record<string, string | number>): string => {
    const text = TRANSLATIONS[this.lang()][key] ?? TRANSLATIONS.en[key] ?? key;
    if (!params) return text;
    return text.replace(/\{(\w+)\}/g, (match, name) => {
      const value = params[name];
      return value === undefined ? match : String(value);
    });
  };

  setLang(lang: Lang) {
    this.lang.set(lang);
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // not persisting the choice is better than breaking the switch
    }
  }
}
