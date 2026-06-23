import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ScheduleService, Schedule } from '../../core/services/schedule.service';
import { HerettoService, Deployment, Scenario, CcmsBranch, ScenarioParameter, CcmsLocale, CcmsResource } from '../../core/services/heretto.service';
import { NotificationService } from '../../core/services/notification.service';
import { CronBuilderComponent } from '../../shared/components/cron-builder/cron-builder.component';
import { DocumentPickerComponent, DocumentPickerData } from '../../shared/components/document-picker/document-picker.component';

function requireNonEmpty(control: AbstractControl) {
  return Array.isArray(control.value) && control.value.length > 0 ? null : { required: true };
}

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

          <mat-form-field appearance="outline" class="full-width" *ngIf="branches.length > 0">
            <mat-label>Branch</mat-label>
            <mat-select formControlName="branch">
              <mat-option *ngFor="let b of branches" [value]="b.name">{{ b.name }}</mat-option>
            </mat-select>
          </mat-form-field>

          <mat-form-field appearance="outline" class="full-width" *ngIf="scenarios.length > 0">
            <mat-label>Publishing Scenario(s)</mat-label>
            <mat-select formControlName="scenario_ids" multiple (selectionChange)="onScenarioChange($event.value)">
              <mat-option *ngFor="let s of scenarios" [value]="s.id">{{ s.name }}</mat-option>
            </mat-select>
            <mat-hint *ngIf="selectedScenarioCount > 1">Output formats shown for first selected scenario</mat-hint>
            <mat-error *ngIf="form.get('scenario_ids')?.hasError('required')">At least one publishing scenario is required</mat-error>
          </mat-form-field>

          <div class="parameters-section" *ngIf="scenarioParameters.length > 0">
            <label class="section-label">Output Format(s)</label>
            <div *ngFor="let param of scenarioParameters" class="parameter-row">
              <ng-container [ngSwitch]="param.type">
                <div *ngSwitchCase="'file_picker'" class="file-picker-param">
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>{{ param.displayName || param.name }}</mat-label>
                    <input matInput [value]="getParameterDisplayValue(param.name)" readonly placeholder="No file selected">
                  </mat-form-field>
                  <button mat-stroked-button type="button" class="browse-btn" (click)="openParameterFilePicker(param.name)">
                    <mat-icon>folder_open</mat-icon>
                    Browse
                  </button>
                </div>
                <div *ngSwitchCase="'file_uuid_picker'" class="file-picker-param">
                  <mat-form-field appearance="outline" class="full-width">
                    <mat-label>{{ param.displayName || param.name }}</mat-label>
                    <input matInput [value]="getParameterDisplayValue(param.name)" readonly placeholder="No file selected">
                  </mat-form-field>
                  <button mat-stroked-button type="button" class="browse-btn" (click)="openParameterFilePicker(param.name)">
                    <mat-icon>folder_open</mat-icon>
                    Browse
                  </button>
                </div>
                <mat-form-field *ngSwitchCase="'option'" appearance="outline" class="full-width">
                  <mat-label>{{ param.displayName || param.name }}</mat-label>
                  <mat-select multiple [value]="getOptionParameterValue(param.name)" (selectionChange)="setParameterValue(param.name, $event.value)">
                    <mat-option *ngFor="let opt of param.options" [value]="opt.value">{{ opt.displayName || opt.value }}</mat-option>
                  </mat-select>
                </mat-form-field>
                <mat-form-field *ngSwitchCase="'ref'" appearance="outline" class="full-width">
                  <mat-label>{{ param.displayName || param.name }}</mat-label>
                  <input matInput [value]="getParameterDisplayValue(param.name)" readonly>
                </mat-form-field>
                <mat-checkbox *ngSwitchCase="'boolean'"
                  [checked]="getParameterValue(param.name) === true || getParameterValue(param.name) === 'true'"
                  [disabled]="scenarioParametersReadOnly"
                  (change)="!scenarioParametersReadOnly && setParameterValue(param.name, $event.checked)">
                  {{ param.displayName || param.name }}
                </mat-checkbox>
                <mat-form-field *ngSwitchDefault appearance="outline" class="full-width">
                  <mat-label>{{ param.displayName || param.name }}</mat-label>
                  <input matInput
                    [value]="getParameterDisplayValue(param.name) || getParameterValue(param.name) || ''"
                    [readonly]="scenarioParametersReadOnly"
                    (input)="!scenarioParametersReadOnly && setParameterValue(param.name, $any($event.target).value)">
                </mat-form-field>
              </ng-container>
            </div>
          </div>

          <!-- Deployment UI hidden — no API endpoint to trigger deployment publish yet
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
          -->

          <div class="document-ids-section">
            <mat-form-field appearance="outline" class="full-width">
              <mat-label>Documents</mat-label>
              <input matInput [value]="documentDisplayValue" readonly placeholder="No documents selected">
            </mat-form-field>
            <input type="hidden" formControlName="document_ids_raw">
            <button mat-stroked-button type="button" class="browse-btn" (click)="openDocumentPicker()">
              <mat-icon>folder_open</mat-icon>
              Browse
            </button>
          </div>

          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Locale(s)</mat-label>
            <mat-select formControlName="locales" multiple>
              <mat-option value="">Source (original language)</mat-option>
              <mat-option *ngFor="let l of localeOptions" [value]="l.code">{{ getLanguageName(l.code) }} ({{ l.code }})</mat-option>
            </mat-select>
            <mat-hint>{{ localeFieldHint }}</mat-hint>
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
    .cron-section {
      margin-bottom: 16px;
      padding: 0;
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
    .document-ids-section, .file-picker-param {
      display: flex;
      gap: 8px;
      align-items: flex-start;
    }
    .document-ids-section .full-width, .file-picker-param .full-width { flex: 1; }
    .document-ids-section .mat-mdc-form-field-subscript-wrapper,
    .file-picker-param .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }
    .browse-btn { height: 56px; }
    .parameters-section {
      margin-bottom: 16px;
      padding: 12px;
      border: 1px solid #e0e0e0;
      border-radius: 4px;
    }
    .section-label {
      display: block;
      font-size: 13px;
      color: #666;
      margin-bottom: 8px;
    }
    .parameter-row { margin-bottom: 8px; }
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
  branches: CcmsBranch[] = [];
  scenarioParameters: ScenarioParameter[] = [];
  scenarioParametersReadOnly = false;
  parameterOverrides: Record<string, unknown> = {};
  parameterDisplayValues: Record<string, string> = {};
  documentDisplayValue = '';
  folderSelections: { id: string; title: string }[] = [];
  localeOptions: CcmsLocale[] = [];
  localeLoading = false;
  localeHint = '';

  get selectedScenarioCount(): number {
    return (this.form.get('scenario_ids')?.value as string[] | null)?.length ?? 0;
  }

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
      scenario_ids: [[], requireNonEmpty],
      deployment_id: [''],
      document_ids_raw: [''],
      branch: ['master'],
      locales: [{ value: [], disabled: true }],
      enabled: [true],
    });
  }

  ngOnInit() {
    this.herettoService.getDeployments()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: d => this.deployments = d, error: () => {} });

    this.herettoService.getScenarios()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: s => this.scenarios = s, error: () => {} });

    this.herettoService.getBranches()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({ next: b => this.branches = b, error: () => {} });

    this.scheduleId = this.route.snapshot.params['id'];
    if (this.scheduleId) {
      this.isEdit = true;
      this.scheduleService.getById(this.scheduleId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (s: Schedule) => {
            this.form.patchValue({
              ...s,
              document_ids_raw: s.document_ids.join(', '),
              scenario_ids: s.scenario_ids || [],
              locales: s.locales || [],
            });
            if (s.document_ids.length > 0) {
              this.fetchLocalesForCurrentDocs(s.locales || []);
            }
            // Populate folder selections and resolve their titles
            if (s.folder_ids?.length > 0) {
              this.folderSelections = s.folder_ids.map(id => ({ id, title: id }));
              for (const folderId of s.folder_ids) {
                this.herettoService.getFolderContents(folderId)
                  .pipe(takeUntilDestroyed(this.destroyRef))
                  .subscribe({
                    next: folder => {
                      const sel = this.folderSelections.find(f => f.id === folderId);
                      if (sel) sel.title = folder.title || folderId;
                      this.documentDisplayValue = this._buildDocumentDisplayValue(this.parseDocumentIds());
                    },
                    error: () => {},
                  });
              }
            }
            this.documentDisplayValue = this._buildDocumentDisplayValue(s.document_ids);
            for (const p of (s.publish_parameters || [])) {
              if (p['name'] && p['value'] !== undefined) {
                this.parameterOverrides[p['name'] as string] = p['value'];
              }
            }
            if (s.scenario_ids?.length > 0) {
              this.loadScenarioParameters(s.scenario_ids[0]);
            }
          },
        });
    }
  }

  get localeFieldHint(): string {
    if (this.localeLoading) return 'Loading available locales\u2026';
    if (this.localeHint) return this.localeHint;
    return 'Select documents first to see available locales';
  }

  getLanguageName(code: string): string {
    try {
      const dn = new Intl.DisplayNames(['en'], { type: 'language' });
      return dn.of(code.replace('_', '-')) || code;
    } catch {
      return code;
    }
  }

  private fetchLocalesForCurrentDocs(preserveSelection: string[] = []) {
    const docIds = this.parseDocumentIds();
    if (docIds.length === 0) {
      this.localeOptions = [];
      this.localeHint = '';
      this.form.get('locales')?.disable();
      return;
    }
    this.localeLoading = true;
    this.localeHint = '';
    this.form.get('locales')?.disable();
    this.herettoService.getLocalesForDocuments(docIds)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: locales => {
          this.localeLoading = false;
          this.localeOptions = locales;
          // Always enable — "Source" option is always available
          this.form.get('locales')?.enable();
          if (locales.length > 0) {
            this.localeHint = `${locales.length} localised language${locales.length > 1 ? 's' : ''} available`;
          } else {
            this.localeHint = 'No translations found — only "Source" is available';
          }
          // Re-apply saved/previous selection where still valid
          if (preserveSelection.length > 0) {
            const validCodes = new Set(['', ...locales.map(l => l.code)]);
            const kept = preserveSelection.filter(c => validCodes.has(c));
            this.form.get('locales')?.setValue(kept);
          }
        },
        error: () => {
          this.localeLoading = false;
          this.localeOptions = [];
          this.form.get('locales')?.enable();
          this.localeHint = 'Could not load locales';
        },
      });
  }

  onScenarioChange(scenarioIds: string[]) {
    this.parameterOverrides = {};
    this.scenarioParameters = [];
    this.scenarioParametersReadOnly = false;
    if (scenarioIds.length > 0) {
      this.loadScenarioParameters(scenarioIds[0]);
    }
  }

  private loadScenarioParameters(scenarioId: string) {
    this.herettoService.getScenarioParameters(scenarioId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: params => {
          console.log('Scenario parameters:', JSON.stringify(params, null, 2));
          this.scenarioParameters = params;
          // Scenarios with 'ref' type params have system-managed file references
          // (e.g. PDF Generator); those params should not be user-editable.
          this.scenarioParametersReadOnly = params.some(p => p['type'] === 'ref');
          for (const p of params) {
            if (!(p.name in this.parameterOverrides)) {
              if (p.type === 'option') {
                this.parameterOverrides[p.name] = p.value !== undefined && p.value !== '' ? [String(p.value)] : [];
              } else if (p.value !== undefined && p.value !== '') {
                this.parameterOverrides[p.name] = p.value;
              }
            }
          }
          this.resolveRefDisplayValues(params);
        },
        error: () => {},
      });
  }

  private resolveRefDisplayValues(params: ScenarioParameter[]) {
    const refParams = params.filter(p => p.type === 'ref' && p.value && typeof p.value === 'string');
    for (const p of refParams) {
      const uuid = p.value as string;
      this.herettoService.getDocumentInfo(uuid)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: doc => {
            this.parameterDisplayValues[p.name] = `${doc.title || uuid} (${uuid})`;
          },
          error: () => {},
        });
    }
  }

  getParameterValue(name: string): unknown {
    return this.parameterOverrides[name] ?? '';
  }

  getOptionParameterValue(name: string): string[] {
    const val = this.parameterOverrides[name];
    if (Array.isArray(val)) return val as string[];
    if (val && typeof val === 'string') return [val];
    return [];
  }

  setParameterValue(name: string, value: unknown) {
    this.parameterOverrides[name] = value;
  }

  openParameterFilePicker(paramName: string) {
    const branch = this.form.value.branch || 'master';
    const dialogRef = this.dialog.open(DocumentPickerComponent, {
      width: '700px',
      maxHeight: '85vh',
      data: { selectedIds: [], branch, allowAllTypes: true } as DocumentPickerData,
    });

    dialogRef.afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        const items: CcmsResource[] = result?.docs ?? (Array.isArray(result) ? result : []);
        if (items.length > 0) {
          const item = items[0];
          this.parameterOverrides[paramName] = item.id;
          this.parameterDisplayValues[paramName] = `${item.title || item.id} (${item.id})`;
        }
      });
  }

  getParameterDisplayValue(name: string): string {
    if (this.parameterDisplayValues[name]) return this.parameterDisplayValues[name];
    const val = this.parameterOverrides[name];
    return val ? String(val) : '';
  }

  openDocumentPicker() {
    const currentIds = this.parseDocumentIds();
    const branch = this.form.value.branch || 'master';
    const dialogRef = this.dialog.open(DocumentPickerComponent, {
      width: '700px',
      maxHeight: '85vh',
      data: {
        selectedIds: currentIds,
        selectedFolderIds: this.folderSelections.map(f => f.id),
        branch,
      } as DocumentPickerData,
    });

    dialogRef.afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(result => {
        if (!result) return;
        const docs: CcmsResource[] = result.docs ?? [];
        const folders: CcmsResource[] = result.folders ?? [];
        this.folderSelections = folders.map(f => ({ id: f.id, title: f.title || f.id }));
        this.form.patchValue({
          document_ids_raw: docs.map(i => i.id).join(', '),
        });
        this.documentDisplayValue = this._buildDocumentDisplayValue(
          docs.map(i => i.title || i.id)
        );
        // Reset locale selection and reload options for the new documents
        this.form.get('locales')?.setValue([]);
        this.fetchLocalesForCurrentDocs();
      });
  }

  onSubmit() {
    if (this.form.invalid || this.submitting) return;
    this.submitting = true;

    const value = this.form.getRawValue();
    const publishParameters = this.scenarioParameters
      .filter(p => p.name in this.parameterOverrides)
      .map(p => {
        // Preserve all raw fields Heretto returned (including id if present) so the
        // publish endpoint can match parameters correctly. Strip options[] which is
        // display-only and would bloat stored data.
        const { options: _opts, ...rest } = p as Record<string, unknown>;
        return { ...rest, value: this.parameterOverrides[p.name] };
      });

    const input = {
      name: value.name,
      description: value.description,
      cron_expression: value.cron_expression,
      scenario_ids: value.scenario_ids || [],
      deployment_id: value.deployment_id,
      document_ids: this.parseDocumentIds(),
      folder_ids: this.folderSelections.map(f => f.id),
      branch: value.branch,
      locales: value.locales || [],
      publish_parameters: publishParameters,
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
      error: (err: unknown) => { console.error('Schedule save error:', err); this.submitting = false; },
    });
  }

  private parseDocumentIds(): string[] {
    const raw = this.form.value.document_ids_raw || '';
    return raw.split(',').map((s: string) => s.trim()).filter(Boolean);
  }

  private _buildDocumentDisplayValue(docLabels: string[] = []): string {
    const parts: string[] = [];
    if (this.folderSelections.length > 0) {
      parts.push(this.folderSelections.map(f => `[folder] ${f.title}`).join(', '));
    }
    if (docLabels.length > 0) {
      parts.push(docLabels.join(', '));
    }
    return parts.join(', ');
  }
}
