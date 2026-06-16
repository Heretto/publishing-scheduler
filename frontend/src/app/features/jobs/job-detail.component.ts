import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { JobService, Job } from '../../core/services/job.service';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';

@Component({
  selector: 'app-job-detail',
  standalone: true,
  imports: [CommonModule, RouterModule, MatCardModule, MatButtonModule, MatProgressSpinnerModule, StatusBadgeComponent],
  template: `
    <mat-spinner *ngIf="loading" diameter="40"></mat-spinner>

    <div *ngIf="job">
      <h1>Job Detail</h1>
      <a mat-button routerLink="/jobs" aria-label="Back to job list">&larr; Back to Jobs</a>

      <mat-card class="detail-card">
        <mat-card-content>
          <dl>
            <dt>ID</dt><dd>{{ job.id }}</dd>
            <dt>Status</dt><dd><app-status-badge [status]="job.status"></app-status-badge></dd>
            <dt>Trigger</dt><dd>{{ job.trigger_type }}</dd>
            <dt>Started</dt><dd>{{ job.started_at | date:'long' }}</dd>
            <dt>Completed</dt><dd>{{ job.completed_at ? (job.completed_at | date:'long') : 'N/A' }}</dd>
            <dt *ngIf="job.heretto_job_id">Heretto Job ID</dt>
            <dd *ngIf="job.heretto_job_id">{{ job.heretto_job_id }}</dd>
            <dt *ngIf="job.error">Error</dt>
            <dd *ngIf="job.error"><code>{{ job.error }}</code></dd>
          </dl>

          <h3>Request Payload</h3>
          <pre>{{ job.request_payload | json }}</pre>

          <h3>Response Payload</h3>
          <pre>{{ job.response_payload | json }}</pre>
        </mat-card-content>
      </mat-card>
    </div>

    <mat-card *ngIf="!loading && !job">
      <mat-card-content>Job not found.</mat-card-content>
    </mat-card>
  `,
  styles: [`
    .detail-card { margin-top: 16px; }
    dl { display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; }
    dt { font-weight: bold; }
    pre { background: #f5f5f5; padding: 12px; border-radius: 4px; overflow-x: auto; }
  `],
})
export class JobDetailComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  job: Job | null = null;
  loading = true;

  constructor(private route: ActivatedRoute, private jobService: JobService) {}

  ngOnInit() {
    const id = this.route.snapshot.params['id'];
    this.jobService.getById(id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: j => { this.job = j; this.loading = false; },
        error: () => { this.loading = false; },
      });
  }
}
