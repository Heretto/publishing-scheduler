import axios, { AxiosInstance } from 'axios';
import { XMLParser } from 'fast-xml-parser';
import { config } from '../config';
import { HerettoClientConfig } from './heretto-client.interface';
import {
  IHerettoCcmsClient,
  CcmsFolder,
  CcmsResource,
  CcmsBranch,
  CcmsSearchResponse,
} from './heretto-ccms-client.interface';

export class HerettoCcmsClient implements IHerettoCcmsClient {
  private restClient: AxiosInstance;
  private searchClient: AxiosInstance;
  private xmlParser: XMLParser;

  constructor(clientConfig?: HerettoClientConfig & { searchBaseUrl?: string }) {
    const auth = {
      username: clientConfig?.username || config.heretto.username,
      password: clientConfig?.password || config.heretto.password,
    };

    this.restClient = axios.create({
      baseURL: clientConfig?.baseUrl || config.heretto.ccmsBaseUrl,
      auth,
      headers: {
        Accept: 'application/xml',
      },
      timeout: 30000,
    });

    this.searchClient = axios.create({
      baseURL: clientConfig?.searchBaseUrl || config.heretto.searchBaseUrl,
      auth,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 30000,
    });

    this.xmlParser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: '',
      textNodeName: '_text',
    });
  }

  async getFolderContents(id: string): Promise<CcmsFolder> {
    const response = await this.restClient.get(`/all-files/${id}`, {
      headers: { Accept: 'application/xml' },
    });
    const parsed = this.xmlParser.parse(response.data);
    return this.normalizeFolderResponse(parsed);
  }

  async getDocumentInfo(id: string): Promise<CcmsResource> {
    const response = await this.restClient.get(`/all-files/${id}`, {
      headers: { Accept: 'application/xml' },
    });
    const parsed = this.xmlParser.parse(response.data);
    return this.normalizeResourceResponse(parsed);
  }

  async getBranches(): Promise<CcmsBranch[]> {
    const response = await this.restClient.get('/branches/', {
      headers: { Accept: 'application/xml' },
    });
    const parsed = this.xmlParser.parse(response.data);
    return this.normalizeBranchesResponse(parsed);
  }

  async searchDocuments(query: Record<string, unknown>): Promise<CcmsSearchResponse> {
    const response = await this.searchClient.post('/search', query);
    return this.normalizeSearchResponse(response.data);
  }

  private normalizeFolderResponse(parsed: Record<string, unknown>): CcmsFolder {
    const root = this.extractRoot(parsed);
    const children = this.extractChildren(root);
    // The folder's own name may come from a <name> child element or a name attribute
    const folderName = root.name;
    const titleFromName = typeof folderName === 'object' && folderName !== null
      ? (folderName as Record<string, unknown>)._text
      : folderName;
    return {
      ...root,
      id: String(root.id || root.uuid || ''),
      title: String(root.title || titleFromName || ''),
      type: String(root.type || root.resourceType || 'folder'),
      children,
    };
  }

  private normalizeResourceResponse(parsed: Record<string, unknown>): CcmsResource {
    const root = this.extractRoot(parsed);
    const nameVal = root.name;
    const resolvedName = typeof nameVal === 'object' && nameVal !== null
      ? (nameVal as Record<string, unknown>)._text
      : nameVal;
    return {
      ...root,
      id: String(root.id || root.uuid || ''),
      title: String(root.title || resolvedName || ''),
      type: String(root.type || root.resourceType || ''),
      owner: root.owner ? String(root.owner) : undefined,
      created: root.created ? String(root.created) : undefined,
      modified: root.modified ? String(root.modified) : undefined,
    };
  }

  private normalizeBranchesResponse(parsed: Record<string, unknown>): CcmsBranch[] {
    const root = this.extractRoot(parsed);
    const items = this.toArray(root.branch || root.branches || root);
    return items.map((item: Record<string, unknown>) => ({
      ...item,
      id: String(item.id || item.uuid || ''),
      name: String(item.name || item.title || ''),
      repository: item.repository ? String(item.repository) : undefined,
    }));
  }

  private normalizeSearchResponse(data: Record<string, unknown>): CcmsSearchResponse {
    const results = this.toArray(data.results || data.items || []);
    return {
      results: results.map((item: Record<string, unknown>) => ({
        ...item,
        id: String(item.id || item.uuid || ''),
        title: String(item.title || item.name || ''),
        type: String(item.type || item.resourceType || ''),
      })),
      total: typeof data.total === 'number' ? data.total : results.length,
    };
  }

  private extractRoot(parsed: Record<string, unknown>): Record<string, unknown> {
    // XML responses typically wrap in a root element — unwrap one level
    const keys = Object.keys(parsed);
    if (keys.length === 1 && typeof parsed[keys[0]] === 'object' && parsed[keys[0]] !== null) {
      return parsed[keys[0]] as Record<string, unknown>;
    }
    return parsed;
  }

  private extractChildren(root: Record<string, unknown>): CcmsResource[] {
    // Heretto XML uses <children> containing mixed <folder> and <resource> elements.
    // With attributeNamePrefix: '', attributes land directly on the parsed object.
    // Children may also use a <name> child element whose text is in _text.
    const childContainer = root.children || root.child;
    let items: unknown[];

    if (childContainer && typeof childContainer === 'object' && !Array.isArray(childContainer)) {
      const containerObj = childContainer as Record<string, unknown>;
      // Merge <folder> + <resource> children into one list
      const folders = this.toArray(containerObj.folder).map(f => ({ ...f, type: f.type || 'folder' }));
      const resources = this.toArray(containerObj.resource);

      if (folders.length > 0 || resources.length > 0) {
        items = [...folders, ...resources];
      } else {
        // Fallback: single element type with a different key
        const containerKeys = Object.keys(containerObj);
        items = containerKeys.length === 1
          ? this.toArray(containerObj[containerKeys[0]])
          : this.toArray(childContainer);
      }
    } else {
      items = this.toArray(childContainer || root.resource || root.resources || []);
    }

    return items.map((c: Record<string, unknown>) => {
      // name may be a string attribute or an object { _text: "..." } from a child element
      const nameVal = c.name;
      const resolvedName = typeof nameVal === 'object' && nameVal !== null
        ? (nameVal as Record<string, unknown>)._text
        : nameVal;
      return {
        ...c,
        id: String(c.id || c.uuid || ''),
        title: String(c.title || resolvedName || ''),
        type: String(c.type || c.resourceType || ''),
      };
    });
  }

  private toArray(value: unknown): Record<string, unknown>[] {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return [value as Record<string, unknown>];
    return [];
  }
}
