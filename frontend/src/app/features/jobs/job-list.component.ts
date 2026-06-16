import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatTableModule } from '@angular/material/table';
import { MatPaginatorModule, PageEvent } from '@angular/material/paginator';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { JobService, Job } from '../../core/services/job.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-job-list',
  standalone: true,
  imports: [
    CommonModule, RouterModule, MatTableModule, MatPaginatorModule,
    MatCardModule, MatButtonModule, MatProgressSpinnerModule, StatusBadgeComponent,
  ],
  template: `
    <h1>Job History</h1>

    <mat-spinner *ngIf="loading" diameter="40"></mat-spinner>

    <mat-card *ngIf="!loading">
      <table mat-table [dataSource]="jobs" *ngIf="jobs.length > 0" aria-label="Job history">
        <ng-container matColumnDef="status">
          <th mat-header-cell *matHeaderCellDef>Status</th>
          <td mat-cell *matCellDef="let j"><app-status-badge [status]="j.status"></app-status-badge></td>
        </ng-container>
        <ng-container matColumnDef="trigger">
          <th mat-header-cell *matHeaderCellDef>Trigger</th>
          <td mat-cell *matCellDef="let j">{{ j.trigger_type }}</td>
        </ng-container>
        <ng-container matColumnDef="startedAt">
          <th mat-header-cell *matHeaderCellDef>Started</th>
          <td mat-cell *matCellDef="let j">{{ j.started_at | date:'medium' }}</td>
        </ng-container>
        <ng-container matColumnDef="completedAt">
          <th mat-header-cell *matHeaderCellDef>Completed</th>
          <td mat-cell *matCellDef="let j">{{ j.completed_at ? (j.completed_at | date:'medium') : '—' }}</td>
        </ng-container>
        <ng-container matColumnDef="actions">
          <th mat-header-cell *matHeaderCellDef></th>
          <td mat-cell *matCellDef="let j">
            <a mat-button [routerLink]="[j.id]" [attr.aria-label]="'View details for job ' + j.id">Details</a>
          </td>
        </ng-container>
        <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
        <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
      </table>
      <p *ngIf="jobs.length === 0" style="padding: 16px;">No jobs yet.</p>
      <mat-paginator
        [length]="totalJobs"
        [pageSize]="pageSize"
        [pageSizeOptions]="[10, 20, 50]"
        (page)="onPage($event)"
        aria-label="Job list pagination">
      </mat-paginator>
    </mat-card>
  `,
  styles: [`table { width: 100%; }`],
})
export class JobListComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  jobs: Job[] = [];
  totalJobs = 0;
  pageSize = 20;
  currentPage = 1;
  loading = true;
  displayedColumns = ['status', 'trigger', 'startedAt', 'completedAt', 'actions'];

  constructor(private jobService: JobService) {}

  ngOnInit() { this.loadJobs(); }

  loadJobs() {
    this.loading = true;
    this.jobService.getAll({
      page: String(this.currentPage),
      limit: String(this.pageSize),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: r => { this.jobs = r.data; this.totalJobs = r.total; this.loading = false; },
        error: () => { this.loading = false; },
      });
  }

  onPage(event: PageEvent) {
    this.currentPage = event.pageIndex + 1;
    this.pageSize = event.pageSize;
    this.loadJobs();
  }
}
