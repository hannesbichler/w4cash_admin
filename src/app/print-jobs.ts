import { Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { PrintJobService } from './print-job.service';
import { PrintJob } from './print-job.model';
import { I18nService } from './i18n.service';

@Component({
  selector: 'app-print-jobs',
  imports: [CommonModule, FormsModule],
  templateUrl: './print-jobs.html',
  styleUrl: './print-jobs.css'
})
export class PrintJobs implements OnInit, OnDestroy {
  private svc = inject(PrintJobService);
  protected t = inject(I18nService).t;

  actionMsg = signal('');
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private filterDebounce: ReturnType<typeof setTimeout> | null = null;

  readonly pageSizeOptions = [20, 50, 100];

  jobs = signal<PrintJob[]>([]);
  personNames = signal<string[]>([]);
  selected = signal<PrintJob | null>(null);
  tableFilter = signal('');
  personFilter = signal('');
  statusFilter = signal<'all' | 'ok' | 'fail'>('all');
  loading = signal(false);
  autoRefresh = signal(false);
  page = signal(0);
  pageSize = signal(20);

  // hasNextPage: true when the server returned a full page (more may exist)
  hasNextPage = signal(false);

  ngOnInit() {
    this.load();
    this.svc.persons().subscribe({ next: names => this.personNames.set(names), error: () => {} });
  }

  ngOnDestroy() { this.stopRefresh(); }

  load() {
    this.loading.set(true);
    this.svc.list(
      this.tableFilter() || undefined,
      this.personFilter() || undefined,
      this.statusFilter(),
      this.page(),
      this.pageSize()
    ).subscribe({
      next: jobs => {
        this.jobs.set(jobs);
        this.hasNextPage.set(jobs.length === this.pageSize());
        this.loading.set(false);
      },
      error: () => { this.loading.set(false); this.flash(this.t('printJobs.loadFailed')); }
    });
  }

  onTextFilterChange(setter: (v: string) => void, value: string) {
    setter(value);
    if (this.filterDebounce !== null) clearTimeout(this.filterDebounce);
    this.filterDebounce = setTimeout(() => { this.page.set(0); this.load(); }, 300);
  }

  onPersonFilterChange(value: string) {
    this.personFilter.set(value);
    this.page.set(0);
    this.load();
  }

  onStatusFilterChange(value: 'all' | 'ok' | 'fail') {
    this.statusFilter.set(value);
    this.page.set(0);
    this.load();
  }

  onPageSizeChange(size: number) {
    this.pageSize.set(size);
    this.page.set(0);
    this.load();
  }

  prevPage() {
    if (this.page() > 0) { this.page.update(p => p - 1); this.load(); }
  }

  nextPage() {
    if (this.hasNextPage()) { this.page.update(p => p + 1); this.load(); }
  }

  toggleAutoRefresh(enabled: boolean) {
    this.autoRefresh.set(enabled);
    if (enabled) {
      this.refreshTimer = setInterval(() => this.load(), 5000);
    } else {
      this.stopRefresh();
    }
  }

  private stopRefresh() {
    if (this.refreshTimer !== null) { clearInterval(this.refreshTimer); this.refreshTimer = null; }
  }

  select(job: PrintJob) {
    this.selected.set(this.selected()?.id === job.id ? null : job);
  }

  reprint(job: PrintJob, event: Event) {
    event.stopPropagation();
    this.svc.reprint(job.id).subscribe({
      next: () => {
        this.jobs.update(jobs => jobs.map(j => j.id === job.id ? { ...j, success: true, error: null } : j));
        this.flash(this.t('printJobs.reprintQueued', { id: job.id }));
      },
      error: () => this.flash(this.t('printJobs.reprintFailed', { id: job.id }))
    });
  }

  remove(job: PrintJob, event: Event) {
    event.stopPropagation();
    if (!confirm(this.t('printJobs.confirmDelete', { id: job.id, table: job.tableName }))) return;
    this.svc.delete(job.id).subscribe({
      next: () => {
        if (this.selected()?.id === job.id) this.selected.set(null);
        this.jobs.update(jobs => jobs.filter(j => j.id !== job.id));
        this.flash(this.t('printJobs.deleted', { id: job.id }));
      },
      error: () => this.flash(this.t('printJobs.deleteFailed', { id: job.id }))
    });
  }

  /**
   * Splits ticket content the same way the webserver's PlainTextPrintable does:
   * everything up to the first divider line is the header (small font, except
   * the big "Tisch:" line), the rest are order lines (big font).
   */
  ticketSegments(content: string): { text: string; kind: 'tisch' | 'header' | 'divider' | 'line' }[] {
    const isDivider = (l: string) => /^─+$/.test(l);
    const lines = content.split(/\r\n|\r|\n/).filter(l => l.trim().length > 0);
    const firstDivider = lines.findIndex(isDivider);
    return lines.map((text, i) => {
      if (isDivider(text)) return { text, kind: 'divider' as const };
      const inHeader = firstDivider >= 0 && i < firstDivider;
      if (inHeader && text.startsWith('Tisch:')) return { text, kind: 'tisch' as const };
      return { text, kind: inHeader ? 'header' as const : 'line' as const };
    });
  }

  private flash(msg: string) {
    this.actionMsg.set(msg);
    setTimeout(() => this.actionMsg.set(''), 3000);
  }
}
