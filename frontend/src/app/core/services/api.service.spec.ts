import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ApiService } from './api.service';

describe('ApiService', () => {
  let service: ApiService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(ApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should make GET requests', () => {
    service.get<{ status: string }>('/health').subscribe(data => {
      expect(data.status).toBe('ok');
    });
    const req = httpMock.expectOne('/api/health');
    expect(req.request.method).toBe('GET');
    req.flush({ status: 'ok' });
  });

  it('should make GET requests with params', () => {
    service.get('/jobs', { page: '2', limit: '10' }).subscribe();
    const req = httpMock.expectOne('/api/jobs?page=2&limit=10');
    expect(req.request.method).toBe('GET');
    req.flush({ data: [] });
  });

  it('should skip undefined params', () => {
    service.get('/jobs', { page: '1', status: '' }).subscribe();
    const req = httpMock.expectOne('/api/jobs?page=1');
    req.flush({ data: [] });
  });

  it('should make POST requests', () => {
    const body = { name: 'Test' };
    service.post('/schedules', body).subscribe();
    const req = httpMock.expectOne('/api/schedules');
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual(body);
    req.flush({});
  });

  it('should make PUT requests', () => {
    service.put('/schedules/1', { name: 'Updated' }).subscribe();
    const req = httpMock.expectOne('/api/schedules/1');
    expect(req.request.method).toBe('PUT');
    req.flush({});
  });

  it('should make PATCH requests', () => {
    service.patch('/schedules/1/toggle', { enabled: true }).subscribe();
    const req = httpMock.expectOne('/api/schedules/1/toggle');
    expect(req.request.method).toBe('PATCH');
    req.flush({});
  });

  it('should make DELETE requests', () => {
    service.delete('/schedules/1').subscribe();
    const req = httpMock.expectOne('/api/schedules/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });
});
