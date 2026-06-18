import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterModule, MatToolbarModule, MatListModule, MatIconModule],
  template: `
    <div class="app-layout">
      <nav class="sidenav" role="navigation" aria-label="Main navigation">
        <mat-toolbar color="primary">
          <span>Publishing Scheduler</span>
        </mat-toolbar>
        <mat-nav-list>
          <a mat-list-item routerLink="/dashboard" routerLinkActive="active" aria-label="Dashboard">
            <mat-icon matListItemIcon>dashboard</mat-icon>
            <span matListItemTitle>Dashboard</span>
          </a>
          <a mat-list-item routerLink="/schedules" routerLinkActive="active" aria-label="Schedules">
            <mat-icon matListItemIcon>schedule</mat-icon>
            <span matListItemTitle>Schedules</span>
          </a>
          <a mat-list-item routerLink="/jobs" routerLinkActive="active" aria-label="Job History">
            <mat-icon matListItemIcon>work_history</mat-icon>
            <span matListItemTitle>Job History</span>
          </a>
          <a mat-list-item routerLink="/settings" routerLinkActive="active" aria-label="Settings">
            <mat-icon matListItemIcon>settings</mat-icon>
            <span matListItemTitle>Settings</span>
          </a>
        </mat-nav-list>
      </nav>
      <main class="content" role="main">
        <a class="skip-link" href="#main-content">Skip to content</a>
        <div class="top-bar">
          <div class="top-bar-brand">
            <img src="assets/heretto-logo.svg" alt="Heretto" class="heretto-logo">
            <span class="top-bar-label">Open Projects</span>
          </div>
        </div>
        <div id="main-content">
          <router-outlet></router-outlet>
        </div>
      </main>
    </div>
  `,
  styles: [`
    .app-layout {
      display: flex;
      min-height: 100vh;
      align-items: flex-start;
    }
    .sidenav {
      width: 220px;
      flex-shrink: 0;
      position: sticky;
      top: 0;
      height: 100vh;
      overflow-y: auto;
    }
    .content {
      flex: 1;
      padding: 24px;
      min-width: 0;
    }
    .top-bar {
      display: flex;
      justify-content: flex-end;
      padding: 0 0 16px 0;
    }
    .top-bar-brand {
      display: flex;
      flex-direction: column;
      align-items: flex-end;
    }
    .heretto-logo {
      height: 36px;
    }
    .top-bar-label {
      font-size: 16px;
      color: #666;
      margin-top: 3px;
      letter-spacing: 0.3px;
    }
    .skip-link {
      position: absolute;
      left: -9999px;
      top: auto;
      width: 1px;
      height: 1px;
      overflow: hidden;
    }
    .skip-link:focus {
      position: static;
      width: auto;
      height: auto;
      padding: 8px 16px;
      background: #011627;
      color: #79ECDD;
      z-index: 1000;
    }
  `],
})
export class MainLayoutComponent {}
