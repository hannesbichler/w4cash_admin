import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpErrorResponse } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { I18nService } from './i18n.service';
import { DatabaseSyncService, RemoteDbProperties } from './database-sync.service';

const EMPTY_REMOTE_DB_PROPERTIES: RemoteDbProperties = {
  host: '',
  port: 1521,
  database: 'XE',
  user: '',
  password: ''
};

const DB_SYNC_PROPERTIES_STORAGE_KEY = 'w4cash.dbSync.remoteProperties';

@Component({
  selector: 'app-database-sync',
  imports: [CommonModule, FormsModule],
  templateUrl: './database-sync.html',
  styleUrl: './database-sync.css'
})
export class DatabaseSync implements OnInit {
  private syncService = inject(DatabaseSyncService);
  protected t = inject(I18nService).t;

  running = signal(false);
  testing = signal(false);
  actionMsg = signal('');
  errorMsg = signal<string | null>(null);
  testResponse = signal<string | null>(null);
  testOk = signal<boolean | null>(null);
  form = signal<RemoteDbProperties>({ ...EMPTY_REMOTE_DB_PROPERTIES });

  ngOnInit() {
    const stored = this.loadPersistedForm();
    if (stored) {
      this.form.set(stored);
    }
  }

  updateForm<K extends keyof RemoteDbProperties>(key: K, value: RemoteDbProperties[K]) {
    const next = { ...this.form(), [key]: value };
    this.form.set(next);
    this.persistForm(next);
  }

  runSync() {
    if (this.running()) return;
    const current = this.validatedProperties();
    if (!current) return;
    if (!confirm(this.t('dbSync.confirm'))) return;

    this.running.set(true);
    this.errorMsg.set(null);
    this.actionMsg.set('');

    this.syncService.synchronizeRemoteToLocal({
      host: current.host.trim(),
      port: Math.round(current.port),
      database: current.database.trim(),
      user: current.user.trim(),
      password: current.password
    }).subscribe({
      next: body => {
        this.running.set(false);
        const message = body?.trim();
        this.flash(message !== '' ? message : this.t('dbSync.success'));
      },
      error: (err: HttpErrorResponse) => {
        this.running.set(false);
        if (typeof err.error === 'string' && err.error.trim() !== '') {
          this.errorMsg.set(err.error);
        } else {
          this.errorMsg.set(this.t('dbSync.failed'));
        }
      }
    });
  }

  runTestConnection() {
    if (this.testing()) return;
    const current = this.validatedProperties();
    if (!current) return;

    this.testing.set(true);
    this.errorMsg.set(null);
    this.testResponse.set(null);
    this.testOk.set(null);

    this.syncService.testConnection({
      host: current.host.trim(),
      port: Math.round(current.port),
      database: current.database.trim(),
      user: current.user.trim(),
      password: current.password
    }).subscribe({
      next: body => {
        this.testing.set(false);
        const message = body?.trim();
        this.testResponse.set(message !== '' ? message : this.t('dbSync.testSuccess'));
        this.testOk.set(true);
      },
      error: (err: HttpErrorResponse) => {
        this.testing.set(false);
        const message = typeof err.error === 'string' && err.error.trim() !== ''
          ? err.error
          : this.t('dbSync.testFailed');
        this.testResponse.set(message);
        this.testOk.set(false);
      }
    });
  }

  private flash(msg: string) {
    this.actionMsg.set(msg);
    setTimeout(() => this.actionMsg.set(''), 5000);
  }

  private persistForm(value: RemoteDbProperties) {
    try {
      localStorage.setItem(DB_SYNC_PROPERTIES_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // localStorage may be unavailable in private mode or blocked environments.
    }
  }

  private loadPersistedForm(): RemoteDbProperties | null {
    try {
      const raw = localStorage.getItem(DB_SYNC_PROPERTIES_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return null;

      const source = parsed as Partial<Record<keyof RemoteDbProperties, unknown>>;
      const host = typeof source.host === 'string' ? source.host : EMPTY_REMOTE_DB_PROPERTIES.host;
      const database = typeof source.database === 'string' ? source.database : EMPTY_REMOTE_DB_PROPERTIES.database;
      const user = typeof source.user === 'string' ? source.user : EMPTY_REMOTE_DB_PROPERTIES.user;
      const password = typeof source.password === 'string' ? source.password : EMPTY_REMOTE_DB_PROPERTIES.password;
      const portRaw = source.port;
      const port = typeof portRaw === 'number' && Number.isFinite(portRaw) && portRaw > 0
        ? Math.round(portRaw)
        : EMPTY_REMOTE_DB_PROPERTIES.port;

      return { host, port, database, user, password };
    } catch {
      return null;
    }
  }

  private validatedProperties(): RemoteDbProperties | null {
    const current = this.form();
    if (!current.host.trim() || !current.database.trim() || !current.user.trim() || !current.password.trim()) {
      this.errorMsg.set(this.t('dbSync.validation'));
      return null;
    }
    if (!Number.isFinite(current.port) || current.port <= 0) {
      this.errorMsg.set(this.t('dbSync.validationPort'));
      return null;
    }
    return current;
  }
}
