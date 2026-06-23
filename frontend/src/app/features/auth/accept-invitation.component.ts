import { Component, OnInit } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-accept-invitation',
  standalone: true,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterModule,
    MatFormFieldModule,
    MatInputModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  template: `
    <div class="auth-page">
      <div class="auth-card">
        <img src="assets/heretto-logo.svg" alt="Heretto" class="auth-logo">

        @if (loadingInfo) {
          <mat-spinner diameter="32"></mat-spinner>
        } @else if (infoError) {
          <p class="auth-error">{{ infoError }}</p>
          <a routerLink="/login" class="auth-link">← Back to sign in</a>
        } @else if (done) {
          <h1 class="auth-title">You're in!</h1>
          <p class="auth-subtitle">You've joined <strong>{{ orgName }}</strong>.</p>
          <a routerLink="/" class="auth-submit-link">Go to dashboard</a>
        } @else {
          <h1 class="auth-title">You're invited</h1>
          <p class="auth-subtitle">
            Join <strong>{{ orgName }}</strong> on Publishing Scheduler.
          </p>

          @if (isLoggedIn) {
            <p class="auth-note">You're signed in as <strong>{{ currentEmail }}</strong>.</p>
            @if (errorMessage) { <p class="auth-error">{{ errorMessage }}</p> }
            <button mat-flat-button class="auth-submit" [disabled]="loading" (click)="acceptAsExisting()">
              @if (loading) { <mat-spinner diameter="20"></mat-spinner> } @else { Accept invitation }
            </button>
          } @else {
            <p class="auth-note">Create a password to complete your account.</p>
            <form [formGroup]="form" (ngSubmit)="acceptAsNew()" class="auth-form">
              <mat-form-field appearance="outline">
                <mat-label>Email</mat-label>
                <input matInput type="email" [value]="inviteEmail" disabled>
              </mat-form-field>
              <mat-form-field appearance="outline">
                <mat-label>Password</mat-label>
                <input matInput type="password" formControlName="password" autocomplete="new-password">
                @if (form.get('password')?.hasError('minlength') && form.get('password')?.touched) {
                  <mat-error>At least 8 characters required</mat-error>
                }
              </mat-form-field>
              @if (errorMessage) { <p class="auth-error">{{ errorMessage }}</p> }
              <button mat-flat-button type="submit" class="auth-submit" [disabled]="loading || form.invalid">
                @if (loading) { <mat-spinner diameter="20"></mat-spinner> } @else { Create account & join }
              </button>
            </form>
          }
        }
      </div>
    </div>
  `,
  styles: [`
    .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background-color: #f5f7fa; }
    .auth-card { width: 100%; max-width: 400px; background: #ffffff; border-radius: 12px; padding: 40px 36px; box-shadow: 0px 12px 32px -4px rgba(0, 65, 117, 0.16); display: flex; flex-direction: column; align-items: center; }
    .auth-logo { height: 36px; margin-bottom: 20px; }
    .auth-title { font-family: 'Satoshi', sans-serif; font-size: 22px; font-weight: 700; color: #011627; margin: 0 0 6px; }
    .auth-subtitle { font-size: 14px; color: #64748b; margin: 0 0 16px; text-align: center; }
    .auth-note { font-size: 13px; color: #64748b; margin: 0 0 20px; text-align: center; }
    .auth-form { width: 100%; display: flex; flex-direction: column; gap: 4px; }
    mat-form-field { width: 100%; }
    .auth-error { color: #dc2626; font-size: 13px; margin: 0 0 12px; text-align: center; }
    .auth-submit { width: 100%; height: 44px; background-color: #011627; color: #ffffff; font-family: 'Satoshi', sans-serif; font-weight: 600; font-size: 15px; border-radius: 6px; margin-top: 8px; display: flex; align-items: center; justify-content: center; }
    .auth-submit:hover:not(:disabled) { background-color: #1a3a52; }
    .auth-submit-link { display: block; width: 100%; height: 44px; background-color: #011627; color: #ffffff; font-family: 'Satoshi', sans-serif; font-weight: 600; font-size: 15px; border-radius: 6px; margin-top: 8px; text-align: center; line-height: 44px; text-decoration: none; }
    .auth-link { margin-top: 20px; font-size: 13px; color: #AD4780; }
  `],
})
export class AcceptInvitationComponent implements OnInit {
  form: FormGroup;
  loading = false;
  loadingInfo = true;
  done = false;
  errorMessage = '';
  infoError = '';
  inviteEmail = '';
  orgName = '';
  private token = '';

  get isLoggedIn(): boolean { return this.auth.isLoggedIn$.value; }
  get currentEmail(): string { return this.auth.currentUser?.email ?? ''; }

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private route: ActivatedRoute,
    private router: Router,
  ) {
    this.form = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]],
    });
  }

  ngOnInit(): void {
    this.token = this.route.snapshot.paramMap.get('token') || '';
    if (!this.token) { this.router.navigate(['/login']); return; }

    this.auth.getInvitationInfo(this.token).subscribe({
      next: info => {
        this.inviteEmail = info.email;
        this.orgName = info.organization_name;
        this.loadingInfo = false;
      },
      error: () => {
        this.infoError = 'This invitation link is invalid or has expired.';
        this.loadingInfo = false;
      },
    });
  }

  acceptAsNew(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.auth.acceptInvitationNewUser(this.token, this.form.value.password).subscribe({
      next: () => { this.loading = false; this.done = true; },
      error: err => {
        this.loading = false;
        this.errorMessage = err.error?.detail || 'Failed to accept invitation';
      },
    });
  }

  acceptAsExisting(): void {
    this.loading = true;
    this.auth.acceptInvitationExistingUser(this.token).subscribe({
      next: () => { this.loading = false; this.done = true; },
      error: err => {
        this.loading = false;
        this.errorMessage = err.error?.detail || 'Failed to accept invitation';
      },
    });
  }
}
