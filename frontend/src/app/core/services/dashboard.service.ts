import { Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';

export interface ScheduleStat {
  total: number;
  succeeded: number;
  failed: number;
}

export interface DailyVolume {
  date: string;
  total: number;
  succeeded: number;
  failed: number;
}

export interface DashboardSummary {
  per_schedule_stats: Record<string, ScheduleStat>;
  daily_volumes: DailyVolume[];
  top_locales: Record<string, number>;
}

@Injectable({ providedIn: 'root' })
export class DashboardService {
  constructor(private api: ApiService) {}

  getSummary(): Observable<DashboardSummary> {
    return this.api.get<DashboardSummary>('/dashboard/summary');
  }
}
