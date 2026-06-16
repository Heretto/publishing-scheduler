import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ScheduleService, Schedule } from '../../core/services/schedule.service';
import { NotificationService } from '../../core/services/notification.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { CronDisplayComponent } from '../../shared/components/cron-display/cron-display.component';
import { ConfirmDialogComponent } from '../../shared/components/confirm-dialog/confirm-dialog.component';

@Component({
  selector: 'app-schedule-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, MatTableModule, MatButtonModule, MatIconModule,
    MatSlideToggleModule, MatDialogModule, MatCardModule, MatProgressSpinnerModule,
    StatusBadgeComponent, CronDisplayComponent,
  ],
  template: `
    <div class="header">
      <h1>Schedules</h1>
      <a mat-raised-button color="primary" routerLink="new" aria-label="Create new schedule">
        <mat-icon>add</mat-icon> New Schedule
      </a>
    </div>

    <mat-spinner *ngIf="loading" diameter="40"></mat-spinner>

    <mat-card *ngIf="!loading">
      <table mat-table [dataSource]="schedules" *ngIf="schedules.length > 0" aria-label="Schedules">
        <ng-container matColumnDef="name">
          <th mat-header-cell *matHeaderCellDef>Name</th>
          <td mat-cell *matCellDef="let s">{{ s.name }}</td>
        </ng-container>
        <ng-container matColumnDef="cron">
          <th mat-header-cell *matHeaderCellDef>Schedule</th>
          <td mat-cell *matCellDef="let s">
            <app-cron-display [expression]="s.cron_expression"></app-cron-display>
          </td>
        </ng-container>
        <ng-container matColumnDef="enabled">
          <th mat-header-cell *matHeaderCellDef>Enabled</th>
          <td mat-cell *matCellDef="let s">
            <mat-slide-toggle
              [checked]="s.enabled"
              (change)="toggleEnabled(s)"
              [attr.aria-label]="'Toggle ' + s.name">
            </mat-slide-toggle>
          </td>
        </ng-container>
        <ng-container matColumnDef="lastRun">
          <th mat-header-cell *matHeaderCellDef>Last Run</th>
          <td mat-cell *matCellDef="let s">
            <app-status-badge *ngIf="s.last_run_status" [status]="s.last_run_status"></app-status-badge>
            <span *ngIf="!s.last_run_status">Never</span>
          </td>
        </ng-container>
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef>Actions</th>
          <td mat-cell *matCellDef="let s">
            <button mat-icon-button (click)="triggerNow(s)" [attr.aria-label]="'Trigger ' + s.name + ' now'">
              <mat-icon>play_arrow</mat-icon>
            </button>
            <a mat-icon-button [routerLink]="[s.id, 'edit']" [attr.aria-label]="'Edit ' + s.name">
              <mat-icon>edit</mat-icon>
            </a>
            <button mat-icon-button color="warn" (click)="deleteSchedule(s)" [attr.aria-label]="'Delete ' + s.name">
              <mat-icon>delete</mat-icon>
            </button>
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
      </table>
      <p *ngIf="schedules.length === 0" style="padding: 16px;">
        No schedules yet. <a routerLink="new">Create one</a>
      </p>
    </mat-card>
  `,
  styles: [`
    .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    table { width: 100%; }
  `],
})
export class ScheduleListComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  schedules: Schedule[] = [];
  loading = true;
  displayedColumns = ['name', 'cron', 'enabled', 'lastRun', 'actions'];

  constructor(
    private scheduleService: ScheduleService,
    private notifications: NotificationService,
    private dialog: MatDialog,
  ) {}

  ngOnInit() {
    this.loadSchedules();
  }

  loadSchedules() {
    this.loading = true;
    this.scheduleService.getAll()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: s => { this.schedules = s; this.loading = false; },
        error: () => { this.loading = false; },
      });
  }

  toggleEnabled(schedule: Schedule) {
    this.scheduleService.toggle(schedule.id, !schedule.enabled)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: () => this.loadSchedules() });
  }

  triggerNow(schedule: Schedule) {
    this.scheduleService.trigger(schedule.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.notifications.success('Job triggered successfully'),
      });
  }

  deleteSchedule(schedule: Schedule) {
    const ref = this.dialog.open(ConfirmDialogComponent, {
      data: { title: 'Delete Schedule', message: `Delete "${schedule.name}"?`, confirmText: 'Delete' },
    });
    ref.afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(confirmed => {
        if (confirmed) {
          this.scheduleService.delete(schedule.id)
            .pipe(takeUntilDestroyed(this.destroyRef))
            .subscribe({ next: () => this.loadSchedules() });
        }
      });
  }
}
