import { Component, inject, signal, computed, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ReportService } from './report.service';
import { ReportRef, ReportParamInfo } from './report.model';
import { I18nService } from './i18n.service';

const NUMBER_TYPES = new Set(['Double', 'Integer', 'Long', 'Float', 'BigDecimal', 'Short']);
const DATE_TYPES = new Set(['Date', 'Timestamp']);

@Component({
  selector: 'app-reports',
  imports: [CommonModule, FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.css'
})
export class Reports implements OnInit {
  private svc = inject(ReportService);
  protected t = inject(I18nService).t;

  actionMsg = signal('');

  reports = signal<ReportRef[]>([]);
  selectedReportName = signal<string | null>(null);
  paramValues = signal<Record<string, string>>({});

  loading = signal(false);
  uploading = signal(false);
  running = signal(false);

  selectedParameters = computed<ReportParamInfo[]>(() => {
    const name = this.selectedReportName();
    return this.reports().find(r => r.name === name)?.parameters ?? [];
  });

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.svc.list().subscribe({
      next: reports => { this.reports.set(reports); this.loading.set(false); },
      error: () => { this.loading.set(false); this.flash(this.t('reports.loadFailed')); }
    });
  }

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;

    this.uploading.set(true);
    this.svc.upload(file).subscribe({
      next: () => { this.uploading.set(false); this.flash(this.t('reports.uploaded', { name: file.name })); this.load(); },
      error: () => { this.uploading.set(false); this.flash(this.t('reports.uploadFailed', { name: file.name })); }
    });
  }

  selectReport(report: ReportRef) {
    this.selectedReportName.set(report.name);
    this.paramValues.set(Object.fromEntries(report.parameters.map(p => [p.name, ''])));
  }

  closeDetail() {
    this.selectedReportName.set(null);
    this.paramValues.set({});
  }

  updateParam(name: string, value: string) {
    this.paramValues.update(v => ({ ...v, [name]: value }));
  }

  inputTypeFor(type: string): string {
    if (NUMBER_TYPES.has(type)) return 'number';
    if (DATE_TYPES.has(type)) return 'date';
    return 'text';
  }

  runReport() {
    const name = this.selectedReportName();
    if (!name) return;
    this.running.set(true);
    this.svc.run(name, this.paramValues()).subscribe({
      next: blob => {
        this.running.set(false);
        this.downloadBlob(blob, `${name}.pdf`);
        this.flash(this.t('reports.ran', { name }));
      },
      error: () => { this.running.set(false); this.flash(this.t('reports.runFailed', { name })); }
    });
  }

  deleteReport(report: ReportRef, event: Event) {
    event.stopPropagation();
    if (!confirm(this.t('reports.confirmDelete', { name: report.name }))) return;
    this.svc.delete(report.name).subscribe({
      next: () => {
        this.reports.update(list => list.filter(r => r.name !== report.name));
        if (this.selectedReportName() === report.name) this.closeDetail();
        this.flash(this.t('reports.deleted', { name: report.name }));
      },
      error: () => this.flash(this.t('reports.deleteFailed', { name: report.name }))
    });
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  private flash(msg: string) {
    this.actionMsg.set(msg);
    setTimeout(() => this.actionMsg.set(''), 3000);
  }
}
