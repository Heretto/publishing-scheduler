import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { ShellComponent } from './shell/shell.component';

export const routes: Routes = [
  // ── Unauthenticated auth pages ─────────────────────────────────────────────
  {
    path: 'login',
    loadComponent: () => import('@heretto/hop-ui').then(m => m.HopLoginComponent),
  },
  {
    path: 'forgot-password',
    loadComponent: () => import('@heretto/hop-ui').then(m => m.HopForgotPasswordComponent),
  },
  {
    path: 'reset-password',
    loadComponent: () => import('@heretto/hop-ui').then(m => m.HopResetPasswordComponent),
  },
  {
    path: 'auth/sso/complete',
    loadComponent: () => import('@heretto/hop-ui').then(m => m.HopSSOCallbackComponent),
  },
  {
    path: 'invite/:token',
    loadComponent: () => import('@heretto/hop-ui').then(m => m.HopAcceptInvitationComponent),
  },

  // ── Authenticated app shell ────────────────────────────────────────────────
  {
    path: '',
    component: ShellComponent,
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
        path: 'schedules/:id',
        loadComponent: () =>
          import('./features/schedules/schedule-detail.component').then(m => m.ScheduleDetailComponent),
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
      {
        path: 'account',
        loadComponent: () => import('@heretto/hop-ui').then(m => m.HopAccountComponent),
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        loadComponent: () => import('@heretto/hop-ui').then(m => m.HopAdminComponent),
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
