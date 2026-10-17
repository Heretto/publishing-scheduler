import { Routes } from '@angular/router';
import {
  HopLoginComponent,
  HopForgotPasswordComponent,
  HopResetPasswordComponent,
  HopSSOCallbackComponent,
  HopAcceptInvitationComponent,
  HopCredentialsComponent,
  HopAccountComponent,
  HopAdminComponent,
} from '@heretto/hop-ui';
import { authGuard } from './core/guards/auth.guard';
import { adminGuard } from './core/guards/admin.guard';
import { ShellComponent } from './shell/shell.component';

export const routes: Routes = [
  // ── Unauthenticated auth pages ─────────────────────────────────────────────
  {
    path: 'login',
    component: HopLoginComponent,
  },
  {
    path: 'forgot-password',
    component: HopForgotPasswordComponent,
  },
  {
    path: 'reset-password',
    component: HopResetPasswordComponent,
  },
  {
    path: 'auth/sso/complete',
    component: HopSSOCallbackComponent,
  },
  {
    path: 'invite/:token',
    component: HopAcceptInvitationComponent,
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
        path: 'credentials',
        component: HopCredentialsComponent,
      },
      {
        path: 'account',
        component: HopAccountComponent,
      },
      {
        path: 'admin',
        canActivate: [adminGuard],
        component: HopAdminComponent,
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
