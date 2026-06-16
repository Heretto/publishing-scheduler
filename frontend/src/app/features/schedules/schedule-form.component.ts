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
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ScheduleService } from '../../core/services/schedule.service';
import { HerettoService, Deployment, Scenario } from '../../core/services/heretto.service';
import { NotificationService } from '../../core/services/notification.service';
import { CronBuilderComponent } from '../../shared/components/cron-builder/cron-builder.component';
import { DocumentPickerComponent, DocumentPickerData } from '../../shared/components/document-picker/document-picker.component';

@Component({
  selector: 'app-schedule-form',
  standalone: true,
  imports: [
    CommonModule, ReactiveFormsModule, RouterModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
    MatCardModule, MatCheckboxModule, MatIconModule, MatDialogModule,
    CronBuilderComponent,
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

          <div class="full-width cron-section">
            <label class="cron-label">Schedule</label>
            <app-cron-builder formControlName="cron_expression"></app-cron-builder>
            <div class="mat-error cron-error" *ngIf="form.get('cron_expression')?.touched && form.get('cron_expression')?.hasError('required')">
              Schedule is required
            </div>
          </div>

          <mat-form-field appearance="outline" class="full-width" *ngIf="scenarios.length > 0">
            <mat-label>Scenario</mat-label>
            <mat-select formControlName="scenario_id">
              <mat-option *ngFor="let s of scenarios" [value]="s.id">{{ s.name }}</mat-option>
            </mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width" *ngIf="scenarios.length === 0">
            <mat-label>Scenario ID</mat-label>
            <input matInput formControlName="scenario_id">
            <mat-hint>Paste the scenario ID from Heretto (found in scenario settings)</mat-hint>
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

          <div class="document-ids-section">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Document IDs (comma-separated)</mat-label>
              <input matInput formControlName="document_ids_raw" placeholder="doc-1, doc-2">
            </mat-form-field>
            <button mat-stroked-button type="button" class="browse-btn" (click)="openDocumentPicker()">
              <mat-icon>folder_open</mat-icon>
              Browse
            </button>
          </div>

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
    .cron-section {
      margin-bottom: 16px;
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
    }
    .cron-label {
      display: block;
      font-size: 13px;
      color: #666;
      margin-bottom: 8px;
    }
    .cron-error {
      font-size: 12px;
      margin-top: 4px;
    }
    .actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 16px; }
    .document-ids-section {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .document-ids-section .full-width { flex: 1; }
    .browse-btn { margin-top: 4px; height: 56px; }
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
    private dialog: MatDialog,
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

  openDocumentPicker() {
    const currentIds = this.parseDocumentIds();
    const dialogRef = this.dialog.open(DocumentPickerComponent, {
      width: '700px',
      maxHeight: '85vh',
      data: { selectedIds: currentIds } as DocumentPickerData,
    });

    dialogRef.afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(selectedIds => {
        if (selectedIds && Array.isArray(selectedIds)) {
          this.form.patchValue({
            document_ids_raw: selectedIds.join(', '),
          });
        }
      });
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
      document_ids: this.parseDocumentIds(),
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

  private parseDocumentIds(): string[] {
    const raw = this.form.value.document_ids_raw || '';
    return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
  }
}
