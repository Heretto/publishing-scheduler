import { Component, OnInit, DestroyRef, inject } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatProgressSpinnerModule],
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
  `,
  styles: [`
    .status-item { display: flex; align-items: center; gap: 8px; margin: 8px 0; }
    .ok { color: #4caf50; }
    .err { color: #f44336; }
  `],
})
export class SettingsComponent implements OnInit {
  private destroyRef = inject(DestroyRef);

  backendOk = false;
  herettoOk = false;
  herettoError = 'Not tested';
  checking = true;

  constructor(private http: HttpClient, private api: ApiService) {}

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
  }
}
