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

export interface CcmsSearchResult {
  id: string;
  title: string;
  type: string;
  [key: string]: unknown;
}

export interface CcmsSearchResponse {
  results: CcmsSearchResult[];
  total: number;
}

export interface IHerettoCcmsClient {
  getFolderContents(id: string): Promise<CcmsFolder>;
  getDocumentInfo(id: string): Promise<CcmsResource>;
  getBranches(): Promise<CcmsBranch[]>;
  searchDocuments(query: Record<string, unknown>): Promise<CcmsSearchResponse>;
}
