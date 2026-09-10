import { Routes } from '@angular/router';
import { PrintJobs } from './print-jobs';
import { CloseCash } from './close-cash';
import { Products } from './products';
import { Categories } from './categories';
import { Floors } from './floors';
import { AttributeSets } from './attribute-sets';
import { Taxes } from './taxes';
import { Printers } from './printers';
import { Operators } from './operators';
import { Reports } from './reports';
import { DatabaseSync } from './database-sync';
import { authGuard, loginGuard } from './auth.guard';
import { LoginPage } from './login-page';

export const routes: Routes = [
  { path: '', component: LoginPage, canActivate: [loginGuard] },
  { path: 'dashboard', component: PrintJobs, canActivate: [authGuard] },
  { path: 'close-cash', component: CloseCash, canActivate: [authGuard] },
  { path: 'products', component: Products, canActivate: [authGuard] },
  { path: 'categories', component: Categories, canActivate: [authGuard] },
  { path: 'floors', component: Floors, canActivate: [authGuard] },
  { path: 'attribute-sets', component: AttributeSets, canActivate: [authGuard] },
  { path: 'taxes', component: Taxes, canActivate: [authGuard] },
  { path: 'printers', component: Printers, canActivate: [authGuard] },
  { path: 'operators', component: Operators, canActivate: [authGuard] },
  { path: 'database-sync', component: DatabaseSync, canActivate: [authGuard] },
  { path: 'reports', component: Reports, canActivate: [authGuard] },
  { path: '**', redirectTo: '' },
];
