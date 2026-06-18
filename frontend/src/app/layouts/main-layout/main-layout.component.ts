import { Component } from '@angular/core';
import { RouterModule } from '@angular/router';
import { MatSidenavModule } from '@angular/material/sidenav';
import { MatToolbarModule } from '@angular/material/toolbar';
import { MatListModule } from '@angular/material/list';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-main-layout',
  standalone: true,
  imports: [RouterModule, MatSidenavModule, MatToolbarModule, MatListModule, MatIconModule],
  template: `
    <mat-sidenav-container class="layout-container">
      <mat-sidenav mode="side" opened class="sidenav" role="navigation" aria-label="Main navigation">
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
      </mat-sidenav>
      <mat-sidenav-content class="content" role="main">
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
      </mat-sidenav-content>
    </mat-sidenav-container>
  `,
  styles: [`
    .layout-container { height: 100vh; }
    .content { padding: 24px; }
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
