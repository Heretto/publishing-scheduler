import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule, FormBuilder, FormGroup, Validators, AbstractControl } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ScheduleService, Schedule, DeliveryTarget, SFTPConfig, S3Config } from '../../core/services/schedule.service';
import { HerettoService, Deployment, Scenario, CcmsBranch, ScenarioParameter, CcmsLocale, CcmsResource } from '../../core/services/heretto.service';
import { NotificationService } from '../../core/services/notification.service';
import { CronBuilderComponent } from '../../shared/components/cron-builder/cron-builder.component';
import { DocumentPickerComponent, DocumentPickerData } from '../../shared/components/document-picker/document-picker.component';

function requireNonEmpty(control: AbstractControl) {
  return Array.isArray(control.value) && control.value.length > 0 ? null : { required: true };
}

@Component({
    selector: 'app-schedule-form',
    imports: [
        CommonModule, ReactiveFormsModule, RouterModule,
        MatFormFieldModule, MatInputModule, MatSelectModule, MatButtonModule,
        MatCheckboxModule, MatIconModule, MatDialogModule,
        CronBuilderComponent,
    ],
    template: `
    <!-- Page banner -->
    <div class="page-banner">
      <div class="banner-breadcrumb">
        <a routerLink="/schedules" class="bc-link">Schedules</a>
        <ng-container *ngIf="isEdit && scheduleName">
          <mat-icon class="bc-sep">chevron_right</mat-icon>
          <a [routerLink]="['/schedules', scheduleId]" class="bc-link">{{ scheduleName }}</a>
        </ng-container>
        <mat-icon class="bc-sep">chevron_right</mat-icon>
        <span class="bc-current">{{ isEdit ? 'Edit Schedule' : 'New Schedule' }}</span>
      </div>
      <div class="banner-row">
        <div class="banner-left">
          <h1 class="banner-title">{{ isEdit ? 'Edit Schedule' : 'New Schedule' }}</h1>
          <span class="banner-subtitle">{{ isEdit ? 'Update the configuration for this publishing schedule.' : 'Define the documents, cadence, and publishing settings for a new schedule.' }}</span>
        </div>
      </div>
    </div>

    <!-- Form card -->
    <div class="sn-card sn-form-card" style="margin-top: 20px;">
      <form [formGroup]="form" (ngSubmit)="onSubmit()">

        <!-- GENERAL section -->
        <div class="form-section-header">
          <span class="form-section-title">General</span>
        </div>
        <div class="form-section-body">
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Name</mat-label>
            <input matInput formControlName="name">
            <mat-error *ngIf="form.get('name')?.hasError('required')">Name is required</mat-error>
          </mat-form-field>
          <mat-form-field appearance="outline" class="full-width">
            <mat-label>Description</mat-label>
            <textarea matInput formControlName="description" rows="2"></textarea>
          </mat-form-field>
        </div>

        <!-- SCHEDULE section -->
        <div class="form-section-header">
          <span class="form-section-title">Schedule</span>
        </div>
        <div class="form-section-body">
          <div class="full-width cron-section">
            <label class="cron-label">Recurrence</label>
            <app-cron-builder formControlName="cron_expression"></app-cron-builder>
            <div class="mat-error cron-error" *ngIf="form.get('cron_expression')?.touched && form.get('cron_expression')?.hasError('required')">
              Schedule is required
            </div>
          </div>
        </div>

        <!-- CONTENT section -->
        <div class="form-section-header">
          <span class="form-section-title">Content</span>
        </div>
        <div class="form-section-body">
          <mat-form-field appearance="outline" class="full-width" *ngIf="branches.length > 0">
            <mat-label>Branch</mat-label>
            <mat-select formControlName="branch">
              <mat-option *ngFor="let b of branches" [value]="b.name">{{ b.name }}</mat-option>
            </mat-select>
          </mat-form-field>

          <div class="document-ids-section">
            <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
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
        </div>

        <!-- PUBLISHING section -->
        <div class="form-section-header">
          <span class="form-section-title">Publishing</span>
        </div>
        <div class="form-section-body">
          <mat-form-field appearance="outline" class="full-width" *ngIf="scenarios.length > 0">
            <mat-label>Publishing Scenario(s)</mat-label>
            <mat-select formControlName="scenario_ids" multiple (selectionChange)="onScenarioChange($event.value)">
              <mat-option *ngFor="let s of scenarios" [value]="s.id">{{ s.name }}</mat-option>
            </mat-select>
            <mat-hint *ngIf="selectedScenarioCount > 1">Output formats shown for first selected scenario</mat-hint>
            <mat-error *ngIf="form.get('scenario_ids')?.hasError('required')">At least one publishing scenario is required</mat-error>
          </mat-form-field>

          <ng-container *ngIf="scenarioParameters.length > 0">
            <div class="param-section-label">Output Format(s)</div>
            <div *ngFor="let param of scenarioParameters" class="parameter-row">
              <ng-container [ngSwitch]="param.type">
                <div *ngSwitchCase="'file_picker'" class="file-picker-param">
                  <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
                    <mat-label>{{ param.displayName || param.name }}</mat-label>
                    <input matInput [value]="getParameterDisplayValue(param.name)" readonly placeholder="No file selected">
                  </mat-form-field>
                  <button mat-stroked-button type="button" class="browse-btn" (click)="openParameterFilePicker(param.name)">
                    <mat-icon>folder_open</mat-icon>
                    Browse
                  </button>
                </div>
                <div *ngSwitchCase="'file_uuid_picker'" class="file-picker-param">
                  <mat-form-field appearance="outline" class="full-width" subscriptSizing="dynamic">
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
          </ng-container>

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
        </div>

        <!-- OPTIONS section -->
        <div class="form-section-header">
          <span class="form-section-title">Options</span>
        </div>
        <div class="form-section-body">
          <mat-checkbox formControlName="enabled">Enabled</mat-checkbox>
        </div>

        <!-- PUBLISH DELIVERY section -->
        <div class="form-section-header">
          <span class="form-section-title">Publish Delivery</span>
        </div>
        <div class="form-section-body" formGroupName="delivery">
          <mat-checkbox formControlName="enabled">Deliver publish bundles after each job completes</mat-checkbox>

          <div class="delivery-config" *ngIf="deliveryEnabled">
            <mat-form-field appearance="outline" class="full-width" style="margin-top:14px">
              <mat-label>Target Type</mat-label>
              <mat-select formControlName="type">
                <mat-option value="sftp">SFTP</mat-option>
                <mat-option value="s3">Amazon S3</mat-option>
              </mat-select>
            </mat-form-field>

            <!-- SFTP fields -->
            <ng-container *ngIf="deliveryType === 'sftp'">
              <div class="delivery-row-two">
                <mat-form-field appearance="outline" class="delivery-host">
                  <mat-label>Host</mat-label>
                  <input matInput formControlName="sftp_host" placeholder="sftp.example.com">
                </mat-form-field>
                <mat-form-field appearance="outline" class="delivery-port">
                  <mat-label>Port</mat-label>
                  <input matInput type="number" formControlName="sftp_port">
                </mat-form-field>
              </div>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Username</mat-label>
                <input matInput formControlName="sftp_username" autocomplete="off">
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Password</mat-label>
                <input matInput type="password" formControlName="sftp_password" autocomplete="new-password">
                <mat-hint *ngIf="deliveryTargetExists">Leave unchanged to keep stored password</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Remote Path</mat-label>
                <input matInput formControlName="sftp_remote_path" placeholder="/">
                <mat-hint>Directory on the SFTP server where ZIPs will be placed</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Host Key</mat-label>
                <textarea matInput formControlName="sftp_host_key" rows="3"
                  placeholder="ssh-ed25519 AAAA..." autocomplete="off"></textarea>
              </mat-form-field>
              <div class="host-key-help">
                <div class="host-key-help-header" (click)="hostKeyHelpOpen = !hostKeyHelpOpen">
                  <mat-icon class="host-key-help-icon">info_outline</mat-icon>
                  <span>How to obtain the host key</span>
                  <mat-icon class="host-key-chevron">{{ hostKeyHelpOpen ? 'expand_less' : 'expand_more' }}</mat-icon>
                </div>
                <div class="host-key-help-body" *ngIf="hostKeyHelpOpen">
                  <p>The host key verifies the server's identity and prevents man-in-the-middle attacks over the internet.</p>
                  <ol>
                    <li>Run the following command in a terminal, replacing the port and hostname:
                      <pre class="host-key-cmd">ssh-keyscan -p 22 sftp.example.com</pre>
                    </li>
                    <li>The output contains one line per key type. Prefer <code>ssh-ed25519</code> if present, otherwise use <code>ecdsa-sha2-*</code> or <code>ssh-rsa</code>.</li>
                    <li>Paste the full line (e.g. <code>ssh-ed25519 AAAA…</code>) into the Host Key field above.</li>
                  </ol>
                  <p class="host-key-providers"><strong>Managed providers:</strong> AWS Transfer Family exposes the host key under the server's <em>Host key</em> tab in the console. For other providers, run <code>ssh-keyscan</code> against the public hostname.</p>
                </div>
              </div>
            </ng-container>

            <!-- S3 fields -->
            <ng-container *ngIf="deliveryType === 's3'">
              <div class="delivery-row-two">
                <mat-form-field appearance="outline" class="delivery-host">
                  <mat-label>Bucket</mat-label>
                  <input matInput formControlName="s3_bucket">
                </mat-form-field>
                <mat-form-field appearance="outline" class="delivery-port">
                  <mat-label>Region</mat-label>
                  <input matInput formControlName="s3_region" placeholder="us-east-1">
                </mat-form-field>
              </div>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Access Key ID</mat-label>
                <input matInput formControlName="s3_access_key_id" autocomplete="off">
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Secret Access Key</mat-label>
                <input matInput type="password" formControlName="s3_secret_access_key" autocomplete="new-password">
                <mat-hint *ngIf="deliveryTargetExists">Leave unchanged to keep stored secret</mat-hint>
              </mat-form-field>
              <mat-form-field appearance="outline" class="full-width">
                <mat-label>Key Prefix (optional)</mat-label>
                <input matInput formControlName="s3_prefix" placeholder="deliveries/">
                <mat-hint>Files placed at prefix/filename.zip inside the bucket</mat-hint>
              </mat-form-field>
            </ng-container>
          </div>
        </div>

        <div class="form-footer">
          <button mat-stroked-button type="button" class="btn-cancel" routerLink="/schedules">Cancel</button>
          <button mat-flat-button type="submit" class="btn-save" [disabled]="form.invalid || submitting">
            {{ submitting ? 'Saving…' : (isEdit ? 'Update Schedule' : 'Create Schedule') }}
          </button>
        </div>
      </form>
    </div>
  `,
    styles: [`
    /* ── Banner ─────────────────────────────────────────────── */
    .page-banner {
      background: linear-gradient(135deg, #011627 0%, #0d2137 100%);
      padding: 0 28px;
      margin: -20px -24px 0;
      color: #fff;
    }
    .banner-breadcrumb {
      font-size: 11px;
      color: rgba(255,255,255,0.5);
      padding-top: 16px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .bc-link { color: rgba(255,255,255,0.45); text-decoration: none !important; transition: color 0.1s; }
    .bc-link:hover { color: #79ECDD; }
    .bc-current { color: rgba(255,255,255,0.65); }
    .bc-sep { font-size: 14px; width: 14px; height: 14px; line-height: 14px; color: rgba(255,255,255,0.25); }
    .banner-row {
      display: flex;
      align-items: flex-start;
      padding: 10px 0 18px;
    }
    .banner-left { display: flex; flex-direction: column; gap: 4px; }
    .banner-title { font-size: 22px; font-weight: 700; margin: 0; color: #fff; }
    .banner-subtitle { font-size: 12px; color: rgba(255,255,255,0.5); }

    /* ── Card ───────────────────────────────────────────────── */
    .sn-card {
      background: #fff;
      border: 1px solid #dee2ec;
      border-radius: 4px;
      overflow: hidden;
    }

    /* ── Form sections ───────────────────────────────────────── */
    .form-section-header {
      padding: 8px 20px;
      background: #f8f9fb;
      border-top: 1px solid #dee2ec;
      border-bottom: 1px solid #dee2ec;
    }
    .form-section-header:first-of-type { border-top: none; }
    .form-section-title {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: #42526e;
    }
    .form-section-body { padding: 16px 20px 4px; }

    .form-footer {
      display: flex;
      gap: 8px;
      justify-content: flex-end;
      align-items: center;
      padding: 12px 20px;
      border-top: 1px solid #dee2ec;
      background: #f8f9fb;
    }
    .btn-cancel {
      color: #42526e !important;
      border-color: #c5cdd8 !important;
      font-size: 13px !important;
      height: 34px !important;
    }
    .btn-save {
      background: #AD4780 !important;
      color: #fff !important;
      font-size: 13px !important;
      font-weight: 600 !important;
      height: 34px !important;
    }
    .btn-save[disabled] { opacity: 0.55 !important; }

    /* ── Compact Material form fields ────────────────────────── */
    /* CSS custom properties cascade into Material's internal tokens */
    mat-form-field {
      --mat-form-field-container-height: 42px;
      --mat-form-field-container-vertical-padding: 8px;
      --mat-form-field-container-text-size: 13px;
      --mat-form-field-label-text-size: 13px;
      --mat-form-field-subscript-text-size: 11px;
    }
    /* Fallback: target internal MDC classes directly */
    ::ng-deep .sn-form-card .mat-mdc-form-field-infix {
      min-height: 42px !important;
      padding-top: 8px !important;
      padding-bottom: 8px !important;
    }
    ::ng-deep .sn-form-card input.mat-mdc-input-element,
    ::ng-deep .sn-form-card textarea.mat-mdc-input-element {
      font-size: 13px !important;
    }
    ::ng-deep .sn-form-card .mat-mdc-select-value-text,
    ::ng-deep .sn-form-card .mat-mdc-select-placeholder,
    ::ng-deep .sn-form-card .mat-mdc-select-trigger {
      font-size: 13px !important;
    }

    /* ── Form fields ─────────────────────────────────────────── */
    .full-width { width: 100%; margin-bottom: 8px; }
    .cron-section { margin-bottom: 16px; padding: 0; }
    .cron-label {
      display: block;
      font-size: 11px;
      font-weight: 700;
      color: #42526e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 8px;
    }
    .cron-error { font-size: 12px; margin-top: 4px; }
    .document-ids-section, .file-picker-param {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .document-ids-section .full-width, .file-picker-param .full-width { flex: 1; }
    .document-ids-section .mat-mdc-form-field-subscript-wrapper,
    .file-picker-param .mat-mdc-form-field-subscript-wrapper {
      display: none;
    }
    .browse-btn {
      height: 42px !important;
      margin-top: 3px;
      font-size: 13px !important;
      color: #42526e !important;
      border-color: #c5cdd8 !important;
    }
    .param-section-label {
      font-size: 11px;
      font-weight: 700;
      color: #42526e;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 10px;
      margin-top: 4px;
    }
    .parameter-row { margin-bottom: 8px; }

    /* ── Delivery section ────────────────────────────────────── */
    .delivery-config { margin-bottom: 8px; }
    .delivery-row-two {
      display: flex;
      gap: 8px;
      margin-bottom: 0;
    }
    .delivery-host { flex: 3; margin-bottom: 8px; }
    .delivery-port { flex: 1; margin-bottom: 8px; }

    .host-key-help {
      border: 1px solid var(--hop-border, #e0e0e0);
      border-radius: 6px;
      margin-bottom: 16px;
      overflow: hidden;
    }
    .host-key-help-header {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 14px;
      cursor: pointer;
      font-size: 13px;
      font-weight: 500;
      background: var(--hop-surface-subtle, #f5f8ff);
      user-select: none;
    }
    .host-key-help-header:hover { background: var(--hop-surface-hover, #eef2ff); }
    .host-key-help-icon { font-size: 18px; width: 18px; height: 18px; color: #3b6fd4; }
    .host-key-chevron { font-size: 18px; width: 18px; height: 18px; margin-left: auto; opacity: 0.6; }
    .host-key-help-body {
      padding: 12px 16px;
      font-size: 13px;
      line-height: 1.6;
      border-top: 1px solid var(--hop-border, #e0e0e0);
    }
    .host-key-help-body p { margin: 0 0 8px; }
    .host-key-help-body ol { margin: 0 0 8px; padding-left: 20px; }
    .host-key-help-body li { margin-bottom: 6px; }
    .host-key-cmd {
      display: block;
      margin: 6px 0 2px;
      padding: 6px 10px;
      background: var(--hop-code-bg, #1e1e2e);
      color: var(--hop-code-fg, #cdd6f4);
      border-radius: 4px;
      font-family: monospace;
      font-size: 12px;
    }
    .host-key-providers { margin-top: 8px !important; }
    code {
      font-family: monospace;
      font-size: 12px;
      background: var(--hop-code-inline-bg, rgba(0,0,0,0.07));
      padding: 1px 4px;
      border-radius: 3px;
    }
  `]
})
export class ScheduleFormComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  readonly MASK = '***';

  form: FormGroup;
  isEdit = false;
  scheduleId = '';
  scheduleName = '';
  submitting = false;
  deliveryTargetExists = false;
  hostKeyHelpOpen = false;
  deployments: Deployment[] = [];
  scenarios: Scenario[] = [];
  branches: CcmsBranch[] = [];
  scenarioParameters: ScenarioParameter[] = [];
  scenarioParametersReadOnly = false;
  parameterOverrides: Record<string, unknown> = {};
  parameterDisplayValues: Record<string, string> = {};
  documentDisplayValue = '';
  folderSelections: { id: string; title: string }[] = [];
  documentReleases: Record<string, { id: string; name: string }> = {};
  localeOptions: CcmsLocale[] = [];
  localeLoading = false;
  localeHint = '';

  get selectedScenarioCount(): number {
    return (this.form.get('scenario_ids')?.value as string[] | null)?.length ?? 0;
  }

  get deliveryEnabled(): boolean {
    return !!this.form.get('delivery')?.get('enabled')?.value;
  }

  get deliveryType(): string {
    return this.form.get('delivery')?.get('type')?.value || 'sftp';
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
      delivery: this.fb.group({
        enabled: [false],
        type: ['sftp'],
        sftp_host: [''],
        sftp_port: [22],
        sftp_username: [''],
        sftp_password: [''],
        sftp_remote_path: ['/'],
        sftp_host_key: [''],
        s3_bucket: [''],
        s3_region: [''],
        s3_access_key_id: [''],
        s3_secret_access_key: [''],
        s3_prefix: [''],
      }),
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
            this.scheduleName = s.name;
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
            // Populate pinned releases (id only from DB; name resolved lazily in picker)
            if (s.document_releases) {
              this.documentReleases = Object.fromEntries(
                Object.entries(s.document_releases).map(([mapId, releaseId]) => [
                  mapId, { id: releaseId, name: releaseId },
                ])
              );
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

      this.scheduleService.getDeliveryTarget(this.scheduleId)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: (target: DeliveryTarget) => {
            this.deliveryTargetExists = true;
            const dg = this.form.get('delivery')!;
            dg.patchValue({ enabled: target.enabled, type: target.type });
            if (target.type === 'sftp') {
              const c = target.config as SFTPConfig;
              dg.patchValue({
                sftp_host: c.host, sftp_port: c.port,
                sftp_username: c.username, sftp_password: c.password,
                sftp_remote_path: c.remote_path,
                sftp_host_key: c.host_key,
              });
            } else if (target.type === 's3') {
              const c = target.config as S3Config;
              dg.patchValue({
                s3_bucket: c.bucket, s3_region: c.region,
                s3_access_key_id: c.access_key_id,
                s3_secret_access_key: c.secret_access_key,
                s3_prefix: c.prefix,
              });
            }
          },
          error: () => { /* 404 = no delivery target configured, ignore */ },
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
      width: '75vw',
      maxHeight: '85vh',
      panelClass: 'document-picker-panel',
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
      width: '75vw',
      maxHeight: '85vh',
      panelClass: 'document-picker-panel',
      data: {
        selectedIds: currentIds,
        selectedFolderIds: this.folderSelections.map(f => f.id),
        selectedReleases: this.documentReleases,
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
        this.documentReleases = result.releases ?? {};
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
      document_releases: Object.fromEntries(
        Object.entries(this.documentReleases).map(([k, v]) => [k, v.id])
      ),
      branch: value.branch,
      locales: value.locales || [],
      publish_parameters: publishParameters,
      enabled: value.enabled,
    };

    const obs = this.isEdit
      ? this.scheduleService.update(this.scheduleId, input)
      : this.scheduleService.create(input);

    obs.pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: (schedule) => {
        this.saveDeliveryTarget(schedule.id, () => {
          this.notifications.success(`Schedule ${this.isEdit ? 'updated' : 'created'}`);
          this.router.navigate(['/schedules', schedule.id]);
        });
      },
      error: (err: unknown) => { console.error('Schedule save error:', err); this.submitting = false; },
    });
  }

  private saveDeliveryTarget(scheduleId: string, onComplete: () => void): void {
    const dv = this.form.get('delivery')!.value;

    if (!dv.enabled) {
      if (this.deliveryTargetExists) {
        this.scheduleService.deleteDeliveryTarget(scheduleId)
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe({ next: onComplete, error: () => onComplete() });
      } else {
        onComplete();
      }
      return;
    }

    const body = dv.type === 'sftp'
      ? {
          type: 'sftp' as const,
          host: dv.sftp_host,
          port: dv.sftp_port || 22,
          username: dv.sftp_username,
          password: dv.sftp_password,
          remote_path: dv.sftp_remote_path || '/',
          host_key: dv.sftp_host_key,
          enabled: true,
        }
      : {
          type: 's3' as const,
          bucket: dv.s3_bucket,
          region: dv.s3_region,
          access_key_id: dv.s3_access_key_id,
          secret_access_key: dv.s3_secret_access_key,
          prefix: dv.s3_prefix || '',
          enabled: true,
        };

    this.scheduleService.upsertDeliveryTarget(scheduleId, body)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => onComplete(),
        error: (err: unknown) => {
          console.error('Delivery target save failed:', err);
          this.notifications.success(`Schedule saved — delivery target could not be configured`);
          onComplete();
        },
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
