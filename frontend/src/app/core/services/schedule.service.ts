import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';

export interface Schedule {
  id: string;
  name: string;
  description: string;
  cron_expression: string;
  scenario_ids: string[];
  deployment_id: string;
  document_ids: string[];
  enabled: boolean;
  branch: string;
  locales: string[];
  publish_parameters: Record<string, unknown>[];
  last_run_at: string | null;
  last_run_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateScheduleInput {
  name: string;
  description?: string;
  cron_expression: string;
  scenario_ids: string[];
  deployment_id: string;
  document_ids?: string[];
  enabled?: boolean;
  branch?: string;
  locales?: string[];
  publish_parameters?: Record<string, unknown>[];
}

@Injectable({ providedIn: 'root' })
export class ScheduleService {
  constructor(private api: ApiService) {}

  getAll(): Observable<Schedule[]> {
    return this.api.get<Schedule[]>('/schedules/');
  }

  getById(id: string): Observable<Schedule> {
    return this.api.get<Schedule>(`/schedules/${id}`);
  }

  create(input: CreateScheduleInput): Observable<Schedule> {
    return this.api.post<Schedule>('/schedules/', input);
  }

  update(id: string, input: Partial<CreateScheduleInput>): Observable<Schedule> {
    return this.api.put<Schedule>(`/schedules/${id}`, input);
  }

  delete(id: string): Observable<void> {
    return this.api.delete(`/schedules/${id}`);
  }

  toggle(id: string, enabled: boolean): Observable<Schedule> {
    return this.api.patch<Schedule>(`/schedules/${id}/toggle`, { enabled });
  }

  trigger(id: string): Observable<unknown> {
    return this.api.post(`/schedules/${id}/trigger`, {});
  }
}
