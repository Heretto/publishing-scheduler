import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatChipsModule } from '@angular/material/chips';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-status-badge',
  standalone: true,
  imports: [CommonModule, MatChipsModule, MatIconModule],
  template: `
    <mat-chip [class]="'status-' + status" [attr.aria-label]="'Status: ' + (status | titlecase)">
      <mat-icon *ngIf="icon" class="badge-icon">{{ icon }}</mat-icon>
      {{ status | titlecase }}
    </mat-chip>
  `,
  styles: [`
    .status-success, .status-completed { background-color: #79ECDD !important; color: #011627 !important; }
    .status-failed { background-color: #AD4780 !important; color: #FFFFFF !important; }
    .status-running, .status-pending { background-color: #F7D48E !important; color: #011627 !important; }
    .badge-icon { font-size: 16px; width: 16px; height: 16px; margin-right: 4px; vertical-align: middle; margin-top: -2px; }
  `],
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
