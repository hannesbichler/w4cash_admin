# w4cash Admin

Web front-end for administering a **w4cash** point-of-sale installation: product catalog,
floor plans, tax rates, printers, operators, the daily cash close (Kassenabschluss) and the
print-job log.

It is a browser-only Angular application — every piece of data comes from the w4cash REST
backend over `/api`. There is no local database and no build-time configuration of business
data.

Built with Angular 21 (standalone components, signals, the new control-flow syntax) and
generated with [Angular CLI](https://github.com/angular/angular-cli) 21.2.1.

## Getting started

```bash
npm install
npm start          # or: ng serve
```

Then open `http://localhost:4200/`. The dev server rebuilds and reloads on every source change.

### Backend connection

`ng serve` proxies API traffic through `proxy.conf.json`:

| Browser request | Forwarded to |
| --- | --- |
| `/api/**` | `http://localhost:3000/**` (the `/api` prefix is stripped) |

So the w4cash backend is expected on **port 3000** during development. Point the `target` at a
different host to work against another instance. In a production build the app is served from
the same origin as the backend, and `/api` is expected to be routed there by the web server.

## Building

```bash
npm run build      # production build into dist/
npm run watch      # development build, rebuilt on change
```

Production is the default configuration: output hashing on, plus budgets (500 kB warning /
1 MB error for the initial bundle).

## Tests

No test runner is wired up — `angular.json` defines only the `build` and `serve` targets, and
there is no `test` architect target or e2e framework. `npm test` will fail until one is added.

## Project layout

```
src/
  main.ts                 bootstrap
  index.html, styles.css  document shell and global styles (flash messages, badges, tables)
  app/
    app.ts/.html/.css     app shell: header, top nav, collapsible left rails, language switch
    app.config.ts         providers: HttpClient, router, LOCALE_ID (de-AT / en-US)
    routes.ts             route table
    i18n.service.ts       language signal, t() lookup, localStorage persistence
    translations.ts       the German and English string tables
    <screen>.ts/.html/.css  one component per screen
    <entity>.service.ts   HTTP access for one entity
    <entity>.model.ts     the interfaces that entity's endpoints return
```

Components are flat in `src/app/` and named after the screen they render; each one pairs with
the service and model files for the data it edits. Screens hold their state in signals and call
their service directly — there is no store layer.

## Screens

| Route | Screen | What it does | API |
| --- | --- | --- | --- |
| `/` | **Print Jobs** | Log of tickets sent to the kitchen/customer printers, filtered by table, operator and success. Paged, with optional 5-second auto-refresh, ticket preview rendered like the printed slip, reprint and delete. | `/api/print-jobs`, `/api/persons` |
| `/close-cash` | **Close Cash** | Preview and then perform the Kassenabschluss for one tablet: ticket count, cash/card/paper totals, payment lines and the tax breakdown. | `/api/kassenabschluss/{tabletId}` |
| `/products` | **Products** | Catalog editing with category filter, sorting and gross-price display derived from the tax category. Adds products singly, via a multi-row bulk-insert grid, or by importing an XLSX file; exports the current selection to XLSX. | `/api/products`, `/api/tax-categories` |
| `/categories` | **Categories** | The category tree, including parent reassignment (a category cannot be moved under its own descendant) and the kitchen printer slot each category prints to. | `/api/categories` |
| `/attribute-sets` | **Attribute Sets** | Attribute sets, the attributes in them, and each attribute's list of selectable values with their order. | `/api/attribute-sets`, `/api/attributes` |
| `/taxes` | **Taxes** | Tax categories and their rates over time. Rates are typed as percentages and stored as the backend's decimal fraction. | `/api/tax-categories` |
| `/floors` | **Floors** | Floors and their tables, edited on a floor plan you can drag and resize, with a right-click menu; unset size/font values are previewed exactly as the POS renders them. | `/api/floors`, `/api/places` |
| `/printers` | **Printers** | Maps the three kitchen printer slots and the customer printer onto the printers installed on the server. | `/api/printers/installed`, `/api/printers/config` |
| `/operators` | **Operators** | Roles and the operators (Bediener) assigned to them, including login card. Clicking a role filters the operator list. | `/api/roles`, `/api/persons` |
| `/reports` | **Reports** | Uploads JasperReports definitions, prompts for each report's declared parameters (typed as number, date or text) and downloads the generated result. | `/api/reports` |

Unknown routes redirect to `/`.

## Internationalization

The UI ships German (default) and English. `translations.ts` holds one flat key/value table per
language; `I18nService.t('some.key', { param: 1 })` looks a key up against the current language,
falls back to English and then to the key itself, and fills `{name}` placeholders. Because `t` is
an arrow function reading a signal, changing the language re-renders every interpolation
immediately.

The chosen language is stored in `localStorage` under `w4cash-admin.lang`. One caveat: Angular's
date and number pipes read `LOCALE_ID` once at bootstrap, so switching languages retranslates the
text right away but reformats numbers and dates only after a reload.

## Conventions

- **Standalone components only** — no NgModules; each component lists its own `imports`.
- **Signals for state**, `computed` for anything derived. No RxJS state beyond the HTTP calls.
- **Two message channels**: transient responses to an action use the floating `.flash` toast
  (3 seconds); errors describing the state of the view use the in-flow `.state-error` block.
- **Backend field names are kept as they arrive** (`id_`, `taxCatId`, `pricesell`) rather than
  renamed, so a model lines up with the JSON it parses.
- Angular schematics are configured to skip test files (`angular.json` → `schematics`).

## Additional resources

- [Angular CLI command reference](https://angular.dev/tools/cli)
