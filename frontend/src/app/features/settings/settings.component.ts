import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [
    CommonModule,
    MatCardModule,
    MatCheckboxModule,
    MatIconModule,
    MatProgressSpinnerModule,
    MatSnackBarModule,
  ],
  template: `
    <h1>Settings</h1>

    <mat-card>
      <mat-card-header>
        <mat-card-title>API Connection Status</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <mat-spinner *ngIf="checking" diameter="24"></mat-spinner>
        <div class="status-item" *ngIf="!checking">
          <mat-icon [class]="backendOk ? 'ok' : 'err'" [attr.aria-label]="backendOk ? 'Connected' : 'Disconnected'">
            {{ backendOk ? 'check_circle' : 'error' }}
          </mat-icon>
          <span>Backend API: {{ backendOk ? 'Connected' : 'Unreachable' }}</span>
        </div>
        <div class="status-item" *ngIf="!checking">
          <mat-icon [class]="herettoOk ? 'ok' : 'err'" [attr.aria-label]="herettoOk ? 'Connected' : 'Disconnected'">
            {{ herettoOk ? 'check_circle' : 'error' }}
          </mat-icon>
          <span>Heretto API: {{ herettoOk ? 'Connected' : herettoError }}</span>
        </div>
      </mat-card-content>
    </mat-card>

    <mat-card style="margin-top: 16px;">
      <mat-card-header>
        <mat-card-title>Configuration</mat-card-title>
      </mat-card-header>
      <mat-card-content>
        <p>Configuration is managed via environment variables. See the <code>.env.example</code> file in the project root.</p>
        <ul>
          <li><code>HERETTO_API_BASE_URL</code> — Heretto API base URL</li>
          <li><code>HERETTO_USERNAME</code> — Heretto username</li>
          <li><code>HERETTO_PASSWORD</code> — Heretto password</li>
        </ul>
      </mat-card-content>
    </mat-card>

    <mat-card style="margin-top: 16px;">
      <mat-card-header>
        <mat-card-title>Status Value Exclusions</mat-card-title>
        <mat-card-subtitle>Choose value(s) to exclude from view</mat-card-subtitle>
      </mat-card-header>
      <mat-card-content>
        <mat-spinner *ngIf="valuesLoading" diameter="24"></mat-spinner>
        <ng-container *ngIf="!valuesLoading">
          <p *ngIf="allValues.length === 0" class="empty-hint">No status values found.</p>
          <div *ngFor="let v of allValues" class="value-row">
            <mat-checkbox [checked]="excludedSet.has(v)" (change)="toggleExclusion(v, $event.checked)">
              {{ v }}
            </mat-checkbox>
          </div>
        </ng-container>
      </mat-card-content>
    </mat-card>
  `,
  styles: [`
    .status-item { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .ok { color: #4caf50; }
    .err { color: #f44336; }
    .value-row { margin: 4px 0; }
    .empty-hint { color: #999; font-size: 0.85rem; }
  `],
})
export class SettingsComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  backendOk = false;
  herettoOk = false;
  herettoError = 'Not tested';
  checking = true;

  allValues: string[] = [];
  excludedSet = new Set<string>();
  valuesLoading = true;

  constructor(private http: HttpClient, private api: ApiService, private snackBar: MatSnackBar) {}

  ngOnInit() {
    this.http.get('/api/health')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => { this.backendOk = true; this.checking = false; },
        error: () => { this.backendOk = false; this.checking = false; },
      });

    this.api.get('/heretto/deployments')
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => this.herettoOk = true,
        error: (err) => {
          this.herettoOk = false;
          this.herettoError = err.status === 0 ? 'Server unreachable' :
            err.status === 502 ? 'Heretto API unreachable' :
            `Connection failed (${err.status})`;
        },
      });

    this.loadValues();
  }

  loadValues() {
    forkJoin({
      excluded: this.api.get<{ value: string }[]>('/settings/status-exclusions'),
      available: this.api.get<string[]>('/heretto/ccms/metadata/status-values'),
    })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: ({ excluded, available }) => {
          const excludedValues = excluded.map(r => r.value);
          this.excludedSet = new Set(excludedValues);
          const merged = new Set([...available, ...excludedValues]);
          this.allValues = [...merged].sort();
          this.valuesLoading = false;
        },
        error: () => { this.valuesLoading = false; },
      });
  }

  toggleExclusion(value: string, checked: boolean) {
    if (checked) {
      this.api.post('/settings/status-exclusions', { value })
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => { this.excludedSet = new Set([...this.excludedSet, value]); },
          error: (err) => this.snackBar.open(err.error?.detail ?? 'Failed to exclude', 'OK', { duration: 3000 }),
        });
    } else {
      this.api.delete(`/settings/status-exclusions/${encodeURIComponent(value)}`)
        .pipe(takeUntilDestroyed(this.destroyRef))
        .subscribe({
          next: () => {
            const next = new Set(this.excludedSet);
            next.delete(value);
            this.excludedSet = next;
          },
          error: () => this.snackBar.open('Failed to remove', 'OK', { duration: 3000 }),
        });
    }
  }
}
