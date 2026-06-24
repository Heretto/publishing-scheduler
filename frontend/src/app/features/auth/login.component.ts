import { Component } from '@angular/core';
import { FormBuilder, FormGroup, Validators, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-login',
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
        <h1 class="auth-title">Publishing Scheduler</h1>
        <p class="auth-subtitle">Sign in to your account</p>

        <form [formGroup]="form" (ngSubmit)="onSubmit()" class="auth-form">
          <mat-form-field appearance="outline">
            <mat-label>Email</mat-label>
            <input matInput type="email" formControlName="email" autocomplete="email">
            @if (form.get('email')?.hasError('required') && form.get('email')?.touched) {
              <mat-error>Email is required</mat-error>
            }
            @if (form.get('email')?.hasError('email') && form.get('email')?.touched) {
              <mat-error>Enter a valid email address</mat-error>
            }
          </mat-form-field>

          <mat-form-field appearance="outline">
            <mat-label>Password</mat-label>
            <input matInput type="password" formControlName="password" autocomplete="current-password">
            @if (form.get('password')?.hasError('required') && form.get('password')?.touched) {
              <mat-error>Password is required</mat-error>
            }
          </mat-form-field>

          @if (errorMessage) {
            <p class="auth-error">{{ errorMessage }}</p>
          }

          <button
            mat-flat-button
            type="submit"
            class="auth-submit"
            [disabled]="loading || form.invalid">
            @if (loading) {
              <mat-spinner diameter="20"></mat-spinner>
            } @else {
              Sign in
            }
          </button>
        </form>

        <a routerLink="/forgot-password" class="auth-link">Forgot password?</a>
      </div>
    </div>
  `,
    styles: [`
    .auth-page {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background-color: #f5f7fa;
    }
    .auth-card {
      width: 100%;
      max-width: 400px;
      background: #ffffff;
      border-radius: 12px;
      padding: 40px 36px;
      box-shadow: 0px 12px 32px -4px rgba(0, 65, 117, 0.16);
      display: flex;
      flex-direction: column;
      align-items: center;
    }
    .auth-logo {
      height: 36px;
      margin-bottom: 20px;
    }
    .auth-title {
      font-family: 'Satoshi', sans-serif;
      font-size: 22px;
      font-weight: 700;
      color: #011627;
      margin: 0 0 6px;
    }
    .auth-subtitle {
      font-size: 14px;
      color: #64748b;
      margin: 0 0 28px;
    }
    .auth-form {
      width: 100%;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }
    mat-form-field {
      width: 100%;
    }
    .auth-error {
      color: #dc2626;
      font-size: 13px;
      margin: 0 0 8px;
      text-align: center;
    }
    .auth-submit {
      width: 100%;
      height: 44px;
      background-color: #011627;
      color: #ffffff;
      font-family: 'Satoshi', sans-serif;
      font-weight: 600;
      font-size: 15px;
      border-radius: 6px;
      margin-top: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .auth-submit:hover:not(:disabled) {
      background-color: #1a3a52;
    }
    .auth-link {
      margin-top: 20px;
      font-size: 13px;
      color: #AD4780;
    }
  `]
})
export class LoginComponent {
  form: FormGroup;
  loading = false;
  errorMessage = '';

  constructor(
    private fb: FormBuilder,
    private auth: AuthService,
    private router: Router,
  ) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
    });
  }

  onSubmit(): void {
    if (this.form.invalid) return;
    this.loading = true;
    this.errorMessage = '';

    const { email, password } = this.form.value;
    this.auth.login(email, password).subscribe({
      next: () => this.router.navigate(['/']),
      error: err => {
        this.loading = false;
        this.errorMessage =
          err.error?.detail || err.error?.error || 'Invalid email or password';
      },
    });
  }
}
