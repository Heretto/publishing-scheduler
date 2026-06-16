import { Routes } from '@angular/router';
import { MainLayoutComponent } from './layouts/main-layout/main-layout.component';

export const routes: Routes = [
  {
    path: '',
    component: MainLayoutComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
      },
      {
        path: 'schedules/new',
        loadComponent: () => import('./features/schedules/schedule-form.component').then(m => m.ScheduleFormComponent),
      },
      {
        path: 'schedules/:id/edit',
        loadComponent: () => import('./features/schedules/schedule-form.component').then(m => m.ScheduleFormComponent),
      },
      {
        path: 'schedules',
        loadComponent: () => import('./features/schedules/schedule-list.component').then(m => m.ScheduleListComponent),
      },
      {
        path: 'jobs/:id',
        loadComponent: () => import('./features/jobs/job-detail.component').then(m => m.JobDetailComponent),
      },
      {
        path: 'jobs',
        loadComponent: () => import('./features/jobs/job-list.component').then(m => m.JobListComponent),
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent),
      },
      { path: '**', redirectTo: 'dashboard' },
    ],
  },
];
