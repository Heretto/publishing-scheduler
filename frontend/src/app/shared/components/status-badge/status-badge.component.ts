import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
    selector: 'app-status-badge',
    imports: [CommonModule, MatIconModule],
    template: `
    <span class="status-badge status-{{ status }}" [attr.aria-label]="'Status: ' + (status | titlecase)">
      <mat-icon *ngIf="icon" class="badge-icon">{{ icon }}</mat-icon>
      {{ status | titlecase }}
    </span>
  `,
    styles: [`
    .status-badge {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 2px 10px;
      border-radius: 16px;
      font-size: 12px;
      font-weight: 500;
      line-height: 20px;
      white-space: nowrap;
    }
    .status-success, .status-completed { background-color: #79ECDD; color: #011627; }
    .status-failed { background-color: #AD4780; color: #FFFFFF; }
    .status-running, .status-pending { background-color: #F7D48E; color: #011627; }
    .badge-icon { font-size: 16px; width: 16px; height: 16px; }
  `]
})
export class StatusBadgeComponent {
  @Input() status = '';

  get icon(): string {
    switch (this.status) {
      case 'success':
      case 'completed': return 'check_circle';
      case 'failed': return 'error';
      case 'running': return 'sync';
      case 'pending': return 'schedule';
      default: return '';
    }
  }
}
