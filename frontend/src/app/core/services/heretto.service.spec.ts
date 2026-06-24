import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HerettoService, Deployment, Scenario, CcmsLocale, ScenarioParameter } from './heretto.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('HerettoService', () => {
  let service: HerettoService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(HerettoService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ── getDeployments ────────────────────────────────────────────────────────

  it('getDeployments fetches deployment list', () => {
    const mock: Deployment[] = [{ id: 'dep-1', name: 'Production' }];
    service.getDeployments().subscribe(data => {
      expect(data.length).toBe(1);
      expect(data[0].id).toBe('dep-1');
    });
    httpMock.expectOne('/api/v1/heretto/deployments').flush(mock);
  });

  // ── getScenarios ──────────────────────────────────────────────────────────

  it('getScenarios fetches scenario list', () => {
    const mock: Scenario[] = [
      { id: '500009', name: 'HTML5' },
      { id: '500010', name: 'PDF' },
    ];
    service.getScenarios().subscribe(data => {
      expect(data.length).toBe(2);
      expect(data[0].id).toBe('500009');
    });
    httpMock.expectOne('/api/v1/heretto/scenarios').flush(mock);
  });

  it('getScenarios returns ids as strings', () => {
    // Backend normalises integers to strings before sending to client
    const mock: Scenario[] = [{ id: '500009', name: 'HTML5' }];
    service.getScenarios().subscribe(data => {
      expect(typeof data[0].id).toBe('string');
    });
    httpMock.expectOne('/api/v1/heretto/scenarios').flush(mock);
  });

  // ── getScenarioParameters ─────────────────────────────────────────────────

  it('getScenarioParameters fetches for a given scenario ID', () => {
    const mock: ScenarioParameter[] = [
      { name: 'format', displayName: 'Output Format', type: 'option', value: null, options: [] },
    ];
    service.getScenarioParameters('500009').subscribe(data => {
      expect(data.length).toBe(1);
      expect(data[0].name).toBe('format');
    });
    httpMock.expectOne('/api/v1/heretto/scenarios/500009/parameters').flush(mock);
  });

  // ── getLocalesForDocuments ────────────────────────────────────────────────

  it('getLocalesForDocuments posts document_ids and returns locales', () => {
    const mockLocales: CcmsLocale[] = [
      { code: 'fr-fr' },
      { code: 'de-de' },
    ];
    service.getLocalesForDocuments(['doc-1', 'doc-2']).subscribe(data => {
      expect(data.length).toBe(2);
      expect(data[0].code).toBe('fr-fr');
    });
    const req = httpMock.expectOne('/api/v1/heretto/ccms/locales');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ document_ids: ['doc-1', 'doc-2'] });
    req.flush(mockLocales);
  });

  it('getLocalesForDocuments sends correct document_ids in body', () => {
    service.getLocalesForDocuments(['doc-abc']).subscribe();
    const req = httpMock.expectOne('/api/v1/heretto/ccms/locales');
    expect(req.request.body.document_ids).toEqual(['doc-abc']);
    req.flush([]);
  });

  it('getLocalesForDocuments returns empty array when no common locales', () => {
    service.getLocalesForDocuments(['doc-1', 'doc-2']).subscribe(data => {
      expect(data).toEqual([]);
    });
    httpMock.expectOne('/api/v1/heretto/ccms/locales').flush([]);
  });

  it('getLocalesForDocuments handles single document', () => {
    const mockLocales: CcmsLocale[] = [{ code: 'fr-fr' }];
    service.getLocalesForDocuments(['doc-1']).subscribe(data => {
      expect(data[0].code).toBe('fr-fr');
    });
    httpMock.expectOne('/api/v1/heretto/ccms/locales').flush(mockLocales);
  });

  // ── getBranches ───────────────────────────────────────────────────────────

  it('getBranches fetches branch list', () => {
    service.getBranches().subscribe(data => {
      expect(data).toBeDefined();
    });
    httpMock.expectOne('/api/v1/heretto/ccms/branches').flush([{ id: 'master', name: 'master' }]);
  });

  // ── getRootFolder ─────────────────────────────────────────────────────────

  it('getRootFolder fetches without branch param by default', () => {
    service.getRootFolder().subscribe();
    const req = httpMock.expectOne('/api/v1/heretto/ccms/root');
    expect(req.request.params.has('branch')).toBeFalse();
    req.flush({ id: 'root', title: 'content', type: 'folder', children: [] });
  });

  it('getRootFolder includes branch param when provided', () => {
    service.getRootFolder('develop').subscribe();
    const req = httpMock.expectOne(r => r.url.includes('/heretto/ccms/root'));
    expect(req.request.params.get('branch')).toBe('develop');
    req.flush({ id: 'root', title: 'content', type: 'folder', children: [] });
  });

  // ── getFolderContents ─────────────────────────────────────────────────────

  it('getFolderContents fetches folder by ID', () => {
    service.getFolderContents('folder-1').subscribe();
    httpMock
      .expectOne('/api/v1/heretto/ccms/folders/folder-1')
      .flush({ id: 'folder-1', title: 'Docs', type: 'folder', children: [] });
  });

  // ── getDocumentInfo ───────────────────────────────────────────────────────

  it('getDocumentInfo fetches document by ID', () => {
    service.getDocumentInfo('doc-1').subscribe(data => {
      expect(data.id).toBe('doc-1');
    });
    httpMock
      .expectOne('/api/v1/heretto/ccms/documents/doc-1')
      .flush({ id: 'doc-1', title: 'My Doc', type: 'ditamap' });
  });
});
