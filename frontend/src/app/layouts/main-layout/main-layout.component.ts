import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/services/auth.service';

@Component({
    selector: 'app-main-layout',
    imports: [
        CommonModule,
        RouterModule,
        MatIconModule,
        MatButtonModule,
        MatMenuModule,
        MatTooltipModule,
    ],
    template: `
    <div class="app-shell">

      <!-- Global top bar -->
      <header class="global-header">
        <div class="header-brand">
          <img src="assets/heretto-logo.svg" alt="Heretto" class="header-logo">
          <span class="header-open-projects">Open Projects</span>
          <div class="header-brand-divider"></div>
          <span class="header-app-name">Publishing Scheduler</span>
        </div>
        <div class="header-actions">
          <button mat-icon-button class="header-icon-btn" aria-label="Notifications" matTooltip="Notifications">
            <mat-icon>notifications_none</mat-icon>
          </button>
          <button mat-icon-button class="header-icon-btn" aria-label="Help" matTooltip="Help">
            <mat-icon>help_outline</mat-icon>
          </button>
          <button class="user-avatar-btn" [matMenuTriggerFor]="userMenu" aria-label="User menu" matTooltip="Account">
            <span class="user-avatar">{{ userInitial }}</span>
          </button>
          <mat-menu #userMenu="matMenu" class="user-menu-panel">
            @if (auth.currentUser) {
              <div class="menu-user-header">
                <div class="menu-avatar">{{ userInitial }}</div>
                <div class="menu-user-info">
                  <div class="menu-email">{{ auth.currentUser.email }}</div>
                  <div class="menu-role">Administrator</div>
                </div>
              </div>
            }
            <div class="menu-divider"></div>
            <button mat-menu-item (click)="logout()">
              <mat-icon>logout</mat-icon>
              Sign out
            </button>
          </mat-menu>
        </div>
      </header>

      <div class="shell-body">

        <!-- Sidebar navigation -->
        <nav class="app-nav" role="navigation" aria-label="Main navigation">
          <div class="nav-section">
            <div class="nav-section-label">MAIN</div>
            <a class="nav-item" routerLink="/dashboard" routerLinkActive="nav-active"
               aria-label="Dashboard">
              <mat-icon class="nav-icon">dashboard</mat-icon>
              <span class="nav-label">Dashboard</span>
            </a>
            <a class="nav-item" routerLink="/schedules" routerLinkActive="nav-active"
               [routerLinkActiveOptions]="{ exact: false }" aria-label="Schedules">
              <mat-icon class="nav-icon">event_repeat</mat-icon>
              <span class="nav-label">Schedules</span>
            </a>
            <a class="nav-item" routerLink="/jobs" routerLinkActive="nav-active"
               aria-label="Job History">
              <mat-icon class="nav-icon">work_history</mat-icon>
              <span class="nav-label">Job History</span>
            </a>
          </div>

          <div class="nav-spacer"></div>

          <div class="nav-section">
            <div class="nav-section-label">SYSTEM</div>
            <a class="nav-item" routerLink="/settings" routerLinkActive="nav-active"
               aria-label="Settings">
              <mat-icon class="nav-icon">settings</mat-icon>
              <span class="nav-label">Settings</span>
            </a>
          </div>
        </nav>

        <!-- Main content -->
        <main class="app-content" id="main-content" role="main">
          <a class="skip-link" href="#main-content">Skip to content</a>
          <router-outlet></router-outlet>
        </main>

      </div>
    </div>
  `,
    styles: [`
    /* ── Shell ──────────────────────────────────────────────── */
    .app-shell {
      display: flex;
      flex-direction: column;
      height: 100vh;
      overflow: hidden;
      background: #0b1e30;
    }

    /* ── Global header ──────────────────────────────────────── */
    .global-header {
      height: 48px;
      flex-shrink: 0;
      background: #011627;
      border-bottom: 1px solid rgba(255,255,255,0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 20px 0 16px;
      z-index: 100;
    }
    .header-brand {
      display: flex;
      align-items: flex-end;
      gap: 12px;
    }
    .header-logo { height: 26px; filter: brightness(0) invert(1); }
    .header-open-projects {
      font-size: 11px;
      font-weight: 500;
      color: rgba(255,255,255,0.45);
      letter-spacing: 0.2px;
      margin-left: 2px;
    }
    .header-brand-divider {
      width: 1px;
      height: 20px;
      background: rgba(255,255,255,0.18);
    }
    .header-app-name {
      font-size: 13px;
      font-weight: 600;
      color: rgba(255,255,255,0.85);
      letter-spacing: 0.3px;
    }
    .header-actions {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .header-icon-btn {
      color: rgba(255,255,255,0.6) !important;
    }
    .header-icon-btn:hover {
      color: rgba(255,255,255,0.95) !important;
    }
    .user-avatar-btn {
      background: none;
      border: none;
      cursor: pointer;
      padding: 4px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .user-avatar {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      background: #79ECDD;
      color: #011627;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
    }

    /* User menu styling */
    .menu-user-header {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 12px 16px 8px;
    }
    .menu-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: #79ECDD;
      color: #011627;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      font-weight: 700;
      flex-shrink: 0;
    }
    .menu-user-info { display: flex; flex-direction: column; }
    .menu-email {
      font-size: 13px;
      font-weight: 600;
      color: #1d1f2b;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 200px;
    }
    .menu-role { font-size: 11px; color: #97a0af; margin-top: 1px; }
    .menu-divider { height: 1px; background: #e0e4ec; margin: 4px 0; }

    /* ── Shell body ─────────────────────────────────────────── */
    .shell-body {
      display: flex;
      flex: 1;
      overflow: hidden;
    }

    /* ── Sidebar ────────────────────────────────────────────── */
    .app-nav {
      width: 220px;
      flex-shrink: 0;
      background: #011627;
      display: flex;
      flex-direction: column;
      overflow-y: auto;
      overflow-x: hidden;
      border-right: 1px solid rgba(255,255,255,0.06);
      padding: 8px 0 16px;
    }
    .nav-section { display: flex; flex-direction: column; }
    .nav-section-label {
      font-size: 10px;
      font-weight: 700;
      letter-spacing: 1px;
      color: rgba(255,255,255,0.3);
      padding: 12px 16px 4px;
      text-transform: uppercase;
    }
    .nav-item {
      display: flex;
      align-items: center;
      gap: 11px;
      padding: 10px 16px;
      color: rgba(255,255,255,0.62);
      text-decoration: none !important;
      font-size: 13.5px;
      font-weight: 500;
      cursor: pointer;
      border-left: 3px solid transparent;
      transition: background 0.12s, color 0.12s;
      position: relative;
    }
    .nav-item:hover {
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.92);
    }
    .nav-item.nav-active {
      background: rgba(121,236,221,0.1);
      color: #79ECDD;
      border-left-color: #79ECDD;
      font-weight: 600;
    }
    .nav-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      flex-shrink: 0;
    }
    .nav-label { line-height: 1; }
    .nav-spacer { flex: 1; min-height: 20px; }

    /* ── Main content ───────────────────────────────────────── */
    .app-content {
      flex: 1;
      overflow-y: auto;
      background: #f2f4f7;
      position: relative;
      padding: 20px 24px;
    }

    /* Skip link */
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
  `]
})
export class MainLayoutComponent {
  get userInitial(): string {
    const email = this.auth.currentUser?.email ?? '';
    return email.charAt(0).toUpperCase() || '?';
  }

  constructor(public auth: AuthService, private router: Router) {}

  logout(): void {
    this.auth.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login']),
    });
  }
}
