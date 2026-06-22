import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';

export interface Job {
  id: string;
  schedule_id: string;
  status: string;
  trigger_type: string;
  started_at: string;
  completed_at: string | null;
  heretto_job_id: string | null;
  request_payload: Record<string, unknown>;
  response_payload: Record<string, unknown>;
  error: string | null;
}

export interface JobListResponse {
  data: Job[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

@Injectable({ providedIn: 'root' })
export class JobService {
  constructor(private api: ApiService) {}

  getAll(params?: { page?: string; limit?: string; schedule_id?: string; status?: string }): Observable<JobListResponse> {
    return this.api.get<JobListResponse>('/jobs/', params as Record<string, string>);
  }

  getById(id: string): Observable<Job> {
    return this.api.get<Job>(`/jobs/${id}`);
  }
}
