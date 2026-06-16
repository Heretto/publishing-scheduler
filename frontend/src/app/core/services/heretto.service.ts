import { Injectable } from '@angular/core';
import { ApiService } from './api.service';
import { Observable } from 'rxjs';

export interface Deployment {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface Scenario {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface Release {
  id: string;
  name: string;
  [key: string]: unknown;
}

@Injectable({ providedIn: 'root' })
export class HerettoService {
  constructor(private api: ApiService) {}

  getDeployments(): Observable<Deployment[]> {
    return this.api.get<Deployment[]>('/heretto/deployments');
  }

  getScenarios(): Observable<Scenario[]> {
    return this.api.get<Scenario[]>('/heretto/scenarios');
  }

  getReleases(): Observable<Release[]> {
    return this.api.get<Release[]>('/heretto/releases');
  }
}
