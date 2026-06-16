import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ScheduleService } from '../../core/services/schedule.service';
import { HerettoService, Deployment, Scenario } from '../../core/services/heretto.service';
import { NotificationService } from '../../core/services/notification.service';
import { CronDisplayComponent } from '../../shared/components/cron-display/cron-display.component';

@Component({
  selector: 'app-schedule-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatCardModule, MatCheckboxModule, CronDisplayComponent,
  ],
  template: `
    <h1>{{ isEdit ? 'Edit' : 'New' }} Schedule</h1>
    <mat-card>
      <mat-card-content>
        <form [formGroup]="form" (ngSubmit)="onSubmit()">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Name</mat-label>
            <input matInput formControlName="name">
            <mat-error *ngIf="form.get('name')?.hasError('required')">Name is required</mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Description</mat-label>
            <textarea matInput formControlName="description" rows="3"></textarea>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Cron Expression</mat-label>
            <input matInput formControlName="cron_expression" placeholder="0 9 * * *">
            <mat-error *ngIf="form.get('cron_expression')?.hasError('required')">Cron expression is required</mat-error>
            <mat-hint>
              <app-cron-display [expression]="form.get('cron_expression')?.value || ''"></app-cron-display>
            </mat-hint>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width" *ngIf="scenarios.length > 0">
            <mat-label>Scenario</mat-label>
            <mat-select formControlName="scenario_id">
              <mat-option *ngFor="let s of scenarios" [value]="s.id">{{ s.name }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width" *ngIf="scenarios.length === 0">
            <mat-label>Scenario ID</mat-label>
            <input matInput formControlName="scenario_id">
            <mat-hint>Enter scenario ID manually (Heretto API unavailable)</mat-hint>
            <mat-error *ngIf="form.get('scenario_id')?.hasError('required')">Scenario is required</mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width" *ngIf="deployments.length > 0">
            <mat-label>Deployment</mat-label>
            <mat-select formControlName="deployment_id">
              <mat-option *ngFor="let d of deployments" [value]="d.id">{{ d.name }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width" *ngIf="deployments.length === 0">
            <mat-label>Deployment ID</mat-label>
            <input matInput formControlName="deployment_id">
            <mat-hint>Enter deployment ID manually (Heretto API unavailable)</mat-hint>
            <mat-error *ngIf="form.get('deployment_id')?.hasError('required')">Deployment is required</mat-error>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Document IDs (comma-separated)</mat-label>
            <input matInput formControlName="document_ids_raw" placeholder="doc-1, doc-2">
          </mat-form-field>

          <mat-checkbox formControlName="enabled">Enabled</mat-checkbox>

          <div class="actions">
            <button mat-button type="button" routerLink="/schedules">Cancel</button>
            <button mat-raised-button color="primary" type="submit" [disabled]="form.invalid || submitting">
              {{ submitting ? 'Saving...' : (isEdit ? 'Update' : 'Create') }}
            </button>
          </div>
        </form>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .full-width { width: 100%; margin-bottom: 8px; }
    .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
  `],
})
export class ScheduleFormComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  form: FormGroup;
  isEdit = false;
  scheduleId = '';
  submitting = false;
  deployments: Deployment[] = [];
  scenarios: Scenario[] = [];

  constructor(
    private fb: FormBuilder,
    private scheduleService: ScheduleService,
    private herettoService: HerettoService,
    private notifications: NotificationService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.form = this.fb.group({
      name: ['', Validators.required],
      description: [''],
      cron_expression: ['', Validators.required],
      scenario_id: ['', Validators.required],
      deployment_id: ['', Validators.required],
      document_ids_raw: [''],
      enabled: [true],
    });
  }

  ngOnInit() {
    this.herettoService.getDeployments()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: d => this.deployments = d });

    this.herettoService.getScenarios()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: s => this.scenarios = s });

    this.scheduleId = this.route.snapshot.params['id'];
    if (this.scheduleId) {
      this.isEdit = true;
      this.scheduleService.getById(this.scheduleId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: s => {
            this.form.patchValue({
              ...s,
              document_ids_raw: s.document_ids.join(', '),
            });
          },
        });
    }
  }

  onSubmit() {
    if (this.form.invalid || this.submitting) return;
    this.submitting = true;

    const value = this.form.value;
    const input = {
      name: value.name,
      description: value.description,
      cron_expression: value.cron_expression,
      scenario_id: value.scenario_id,
      deployment_id: value.deployment_id,
      document_ids: value.document_ids_raw
        ? value.document_ids_raw.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
      enabled: value.enabled,
    };

    const obs = this.isEdit
      ? this.scheduleService.update(this.scheduleId, input)
      : this.scheduleService.create(input);

    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.notifications.success(`Schedule ${this.isEdit ? 'updated' : 'created'}`);
        this.router.navigate(['/schedules']);
      },
      error: () => { this.submitting = false; },
    });
  }
}
