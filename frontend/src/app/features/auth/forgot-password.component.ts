import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-forgot-password',
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
        <h1 class="auth-title">Reset password</h1>

        @if (!submitted) {
          <p class="auth-subtitle">Enter your email and we'll send you a reset link.</p>
          <form [formGroup]="form" (ngSubmit)="onSubmit()" class="auth-form">
            <mat-form-field appearance="outline">
              <mat-label>Email</mat-label>
              <input matInput type="email" formControlName="email" autocomplete="email">
              @if (form.get('email')?.hasError('required') && form.get('email')?.touched) {
                <mat-error>Email is required</mat-error>
              }
            </mat-form-field>

            <button mat-flat-button type="submit" class="auth-submit" [disabled]="loading || form.invalid">
              @if (loading) { <mat-spinner diameter="20"></mat-spinner> } @else { Send reset link }
            </button>
          </form>
        } @else {
          <p class="auth-subtitle">
            If an account with that email exists, a password reset link has been sent.
            Check your inbox.
          </p>
        }

        <a routerLink="/login" class="auth-link">← Back to sign in</a>
      </div>
    </div>
  `,
  styles: [`
    .auth-page { min-height: 100vh; display: flex; align-items: center; justify-content: center; background-color: #f5f7fa; }
    .auth-card { width: 100%; max-width: 400px; background: #ffffff; border-radius: 12px; padding: 40px 36px; box-shadow: 0px 12px 32px -4px rgba(0, 65, 117, 0.16); display: flex; flex-direction: column; align-items: center; }
    .auth-logo { height: 36px; margin-bottom: 20px; }
    .auth-title { font-family: 'Satoshi', sans-serif; font-size: 22px; font-weight: 700; color: #011627; margin: 0 0 6px; }
    .auth-subtitle { font-size: 14px; color: #64748b; margin: 0 0 28px; text-align: center; }
    .auth-form { width: 100%; display: flex; flex-direction: column; gap: 4px; }
    mat-form-field { width: 100%; }
    .auth-submit { width: 100%; height: 44px; background-color: #011627; color: #ffffff; font-family: 'Satoshi', sans-serif; font-weight: 600; font-size: 15px; border-radius: 6px; margin-top: 8px; display: flex; align-items: center; justify-content: center; }
    .auth-submit:hover:not(:disabled) { background-color: #1a3a52; }
    .auth-link { margin-top: 20px; font-size: 13px; color: #AD4780; }
  `],
})
export class ForgotPasswordComponent {
  form: FormGroup;
  loading = false;
  submitted = false;

  constructor(private fb: FormBuilder, private auth: AuthService) {
    this.form = this.fb.group({ email: ['', [Validators.required, Validators.email]] });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.auth.forgotPassword(this.form.value.email).subscribe({
      next: () => { this.loading = false; this.submitted = true; },
      error: () => { this.loading = false; this.submitted = true; }, // always show success message
    });
  }
}
