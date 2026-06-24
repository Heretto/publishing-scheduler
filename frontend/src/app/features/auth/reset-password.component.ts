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
    selector: 'app-reset-password',
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
        <h1 class="auth-title">Set new password</h1>

        @if (!done) {
          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="auth-form">
            <mat-form-field appearance="outline">
              <mat-label>New password</mat-label>
              <input matInput type="password" formControlName="password" autocomplete="new-password">
              @if (form.get('password')?.hasError('minlength') && form.get('password')?.touched) {
                <mat-error>At least 8 characters required</mat-error>
              }
            </mat-form-field>

            @if (errorMessage) {
              <p class="auth-error">{{ errorMessage }}</p>
            }

            <button mat-flat-button type="submit" class="auth-submit" [disabled]="loading || form.invalid">
              @if (loading) { <mat-spinner diameter="20"></mat-spinner> } @else { Reset password }
            </button>
          </form>
        } @else {
          <p class="auth-subtitle">Password reset successfully. You can now sign in.</p>
          <a routerLink="/login" class="auth-submit-link">Go to sign in</a>
        }
      </div>
    </div>
  `,
    styles: [`
    .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background-color: #f5f7fa; }
    .auth-card { width: 100%; max-width: 400px; background: #ffffff; border-radius: 12px; padding: 40px 36px; box-shadow: 0px 12px 32px -4px rgba(0, 65, 117, 0.16); display: flex; flex-direction: column; align-items: center; }
    .auth-logo { height: 36px; margin-bottom: 20px; }
    .auth-title { font-family: 'Satoshi', sans-serif; font-size: 22px; font-weight: 700; color: #011627; margin: 0 0 20px; }
    .auth-subtitle { font-size: 14px; color: #64748b; margin: 0 0 28px; text-align: center; }
    .auth-form { width: 100%; display: flex; flex-direction: column; gap: 4px; }
    mat-form-field { width: 100%; }
    .auth-error { color: #dc2626; font-size: 13px; margin: 0 0 8px; text-align: center; }
    .auth-submit { width: 100%; height: 44px; background-color: #011627; color: #ffffff; font-family: 'Satoshi', sans-serif; font-weight: 600; font-size: 15px; border-radius: 6px; margin-top: 8px; display: flex; align-items: center; justify-content: center; }
    .auth-submit:hover:not(:disabled) { background-color: #1a3a52; }
    .auth-submit-link { display: block; width: 100%; height: 44px; background-color: #011627; color: #ffffff; font-family: 'Satoshi', sans-serif; font-weight: 600; font-size: 15px; border-radius: 6px; margin-top: 8px; text-align: center; line-height: 44px; text-decoration: none; }
  `]
})
export class ResetPasswordComponent implements OnInit {
  form: FormGroup;
  loading = false;
  done = false;
  errorMessage = '';
  private token = '';

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
    this.token = this.route.snapshot.queryParamMap.get('token') || '';
    if (!this.token) this.router.navigate(['/login']);
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.errorMessage = '';
    this.auth.resetPassword(this.token, this.form.value.password).subscribe({
      next: () => { this.loading = false; this.done = true; },
      error: err => {
        this.loading = false;
        this.errorMessage = err.error?.detail || 'Invalid or expired reset link';
      },
    });
  }
}
