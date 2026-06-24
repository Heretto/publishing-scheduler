import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ApiService } from './api.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should make GET requests', () => {
    service.get<{ status: string }>('/health').subscribe(data => {
      expect(data.status).toBe('ok');
    });
    const req = httpMock.expectOne('/api/v1/health');
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'ok' });
  });

  it('should make GET requests with params', () => {
    service.get('/jobs', { page: '2', limit: '10' }).subscribe();
    const req = httpMock.expectOne('/api/v1/jobs?page=2&limit=10');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('should skip empty params', () => {
    service.get('/jobs', { page: '1', status: '' }).subscribe();
    const req = httpMock.expectOne('/api/v1/jobs?page=1');
    expect(req.request.params.has('status')).toBeFalse();
    req.flush({ data: [] });
  });

  it('should make POST requests', () => {
    const body = { name: 'Test' };
    service.post('/schedules', body).subscribe();
    const req = httpMock.expectOne('/api/v1/schedules');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('should make PUT requests', () => {
    service.put('/schedules/1', { name: 'Updated' }).subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/1');
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });

  it('should make PATCH requests', () => {
    service.patch('/schedules/1/toggle', { enabled: true }).subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/1/toggle');
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('should make DELETE requests', () => {
    service.delete('/schedules/1').subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
