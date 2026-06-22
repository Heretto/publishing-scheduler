import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';

export interface PublishResult {
  id: string;
  status: string;
  fileId: string;
  _scenario: string;
  _locale: string;
  [key: string]: unknown;
}

export interface JobResponsePayload {
  results?: PublishResult[];
  errors?: string[];
}

export interface Job {
  id: string;
  schedule_id: string;
  schedule_name: string | null;
  status: string;
  trigger_type: string;
  started_at: string;
  completed_at: string | null;
  heretto_job_id: string | null;
  request_payload: {
    scenarios?: string[];
    locales?: string[];
    documentIds?: string[];
    parameters?: Record<string, unknown>[];
  };
  response_payload: JobResponsePayload;
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
