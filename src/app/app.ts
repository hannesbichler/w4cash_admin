import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { I18nService } from './i18n.service';
import { Lang, LANGS, LANG_LABELS } from './translations';
import { AuthService } from './auth.service';

/** One entry of a left rail. Labels are translation keys, resolved as the rail renders. */
interface RailItem {
  link: string;
  icon: string;
  label: string;
  /** Set where the link is the empty route, which prefix matching would make active everywhere. */
  exact?: boolean;
}

interface Rail {
  title: string;
  items: RailItem[];
}

// Every group opens a rail down the left rather than a dropdown. Defining them here rather than
// in the template keeps one rail block doing for all of them.
const RAILS: Record<string, Rail> = {
  'product-config': {
    title: 'nav.productConfig',
    items: [
      { link: '/categories', icon: 'i-categories', label: 'nav.categories' },
      { link: '/products', icon: 'i-products', label: 'nav.products' },
      { link: '/attribute-sets', icon: 'i-attributes', label: 'nav.attributeSets' },
      { link: '/taxes', icon: 'i-taxes', label: 'nav.taxes' }
    ]
  },
  'configuration': {
    title: 'nav.configuration',
    items: [
      { link: '/floors', icon: 'i-floors', label: 'nav.floors' },
      { link: '/printers', icon: 'i-printer', label: 'nav.printers' },
      { link: '/operators', icon: 'i-operators', label: 'nav.operators' },
      { link: '/database-sync', icon: 'i-db-sync', label: 'nav.dbSync' }
    ]
  },
  'analytics': {
    title: 'nav.analytics',
    items: [
      { link: '', icon: 'i-printjobs', label: 'nav.printJobs', exact: true },
      { link: '/reports', icon: 'i-reports', label: 'nav.reports' }
    ]
  }
};

@Component({
  selector: 'app-root',
  imports: [RouterLink, RouterLinkActive, RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  private i18n = inject(I18nService);
  private auth = inject(AuthService);

  t = this.i18n.t;
  lang = this.i18n.lang;
  langs = LANGS;
  langLabel = (lang: Lang) => LANG_LABELS[lang];
  loggedIn = this.auth.loggedIn;
  userName = this.auth.userName;

  /** Name of the rail showing down the left, or null when none is. */
  sideNav = signal<string | null>(null);

  /** The rail to draw; both share the one strip of space, so only one is ever open. */
  rail = computed<Rail | null>(() => {
    const name = this.sideNav();
    return name === null ? null : RAILS[name];
  });

  accountMenuOpen = signal(false);

  // A rail stays put while you move between its screens - a click elsewhere does not dismiss
  // it - until the same toggle closes it again.
  toggleSideNav(name: string, event: Event) {
    event.stopPropagation();
    this.sideNav.set(this.sideNav() === name ? null : name);
  }

  toggleAccountMenu(event?: Event) {
    event?.stopPropagation();
    this.accountMenuOpen.set(!this.accountMenuOpen());
  }

  setLang(value: string) {
    this.i18n.setLang(value as Lang);
  }

  // Both of these hand the browser over to Microsoft and come back on a fresh page load, so
  // neither routes on this side.
  signInWithMicrosoft() {
    this.accountMenuOpen.set(false);
    this.sideNav.set(null);
    this.auth.login();
  }

  signOut() {
    this.accountMenuOpen.set(false);
    this.sideNav.set(null);
    this.auth.logout();
  }
}
