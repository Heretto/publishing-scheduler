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

export interface CcmsResource {
  id: string;
  title: string;
  type: string;
  owner?: string;
  created?: string;
  modified?: string;
  [key: string]: unknown;
}

export interface CcmsFolder {
  id: string;
  title: string;
  type: string;
  children: CcmsResource[];
  [key: string]: unknown;
}

export interface CcmsBranch {
  id: string;
  name: string;
  repository?: string;
  [key: string]: unknown;
}

export interface CcmsSearchResponse {
  results: CcmsResource[];
  total: number;
}

export interface CcmsLocale {
  code: string;
}

export interface ScenarioParameterOption {
  displayName: string | null;
  value: string;
}

export interface ScenarioParameter {
  name: string;
  displayName: string | null;
  type: string;
  value: unknown;
  options: ScenarioParameterOption[];
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

  getFolderContents(id: string): Observable<CcmsFolder> {
    return this.api.get<CcmsFolder>(`/heretto/ccms/folders/${id}`);
  }

  getDocumentInfo(id: string): Observable<CcmsResource> {
    return this.api.get<CcmsResource>(`/heretto/ccms/documents/${id}`);
  }

  getBranches(): Observable<CcmsBranch[]> {
    return this.api.get<CcmsBranch[]>('/heretto/ccms/branches');
  }

  getRootFolder(branch?: string): Observable<CcmsFolder> {
    return this.api.get<CcmsFolder>('/heretto/ccms/root', branch ? { branch } : undefined);
  }

  getScenarioParameters(scenarioId: string): Observable<ScenarioParameter[]> {
    return this.api.get<ScenarioParameter[]>(`/heretto/scenarios/${scenarioId}/parameters`);
  }

  getLocalesForDocuments(docIds: string[]): Observable<CcmsLocale[]> {
    return this.api.post<CcmsLocale[]>('/heretto/ccms/locales', { document_ids: docIds });
  }

  searchDocuments(query: Record<string, unknown>, branch?: string): Observable<CcmsSearchResponse> {
    const body = branch ? { ...query, branch } : query;
    return this.api.post<CcmsSearchResponse>('/heretto/ccms/search', body);
  }

  searchFoldersByName(name: string, branch?: string): Observable<CcmsSearchResponse> {
    const params: Record<string, string> = { name };
    if (branch) params['branch'] = branch;
    return this.api.get<CcmsSearchResponse>('/heretto/ccms/folders/search', params);
  }
}
