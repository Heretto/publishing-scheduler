import { Component } from '@angular/core';
import { HopMainLayoutComponent, NavItem } from '@heretto/hop-ui';

@Component({
  selector: 'app-shell',
  imports: [HopMainLayoutComponent],
  template: `
    <hop-main-layout
      appTitle="Publishing Scheduler"
      [navItems]="navItems">
    </hop-main-layout>
  `,
})
export class ShellComponent {
  navItems: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Schedules', route: '/schedules', icon: 'event_repeat' },
    { label: 'Job History', route: '/jobs', icon: 'work_history' },
    { label: 'Settings', route: '/settings', icon: 'settings' },
  ];
}
