import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
  // ── Unauthenticated auth pages ─────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login.component').then(m => m.LoginComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password.component').then(m => m.ForgotPasswordComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () =>
      import('./features/auth/reset-password.component').then(m => m.ResetPasswordComponent),
  },
  {
    path: 'invite/:token',
    loadComponent: () =>
      import('./features/auth/accept-invitation.component').then(m => m.AcceptInvitationComponent),
  },

  // ── Authenticated app shell ────────────────────────────────────────────────
  {
    path: '',
    component: MainLayoutComponent,
    canActivate: [authGuard],
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'schedules/new',
        loadComponent: () =>
          import('./features/schedules/schedule-form.component').then(m => m.ScheduleFormComponent),
      },
      {
        path: 'schedules/:id/edit',
        loadComponent: () =>
          import('./features/schedules/schedule-form.component').then(m => m.ScheduleFormComponent),
      },
      {
        path: 'schedules',
        loadComponent: () =>
          import('./features/schedules/schedule-list.component').then(m => m.ScheduleListComponent),
      },
      {
        path: 'jobs/:id',
        loadComponent: () =>
          import('./features/jobs/job-detail.component').then(m => m.JobDetailComponent),
      },
      {
        path: 'jobs',
        loadComponent: () =>
          import('./features/jobs/job-list.component').then(m => m.JobListComponent),
      },
      {
        path: 'settings',
        loadComponent: () =>
          import('./features/settings/settings.component').then(m => m.SettingsComponent),
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
