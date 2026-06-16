import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { JobService } from './job.service';

describe('JobService', () => {
  let service: JobService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(JobService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll fetches paginated jobs', () => {
    service.getAll({ page: '1', limit: '10' }).subscribe(data => {
      expect(data.total).toBe(5);
      expect(data.data.length).toBe(5);
    });
    httpMock.expectOne('/api/jobs?page=1&limit=10').flush({
      data: Array(5).fill({ id: '1', status: 'completed' }),
      total: 5,
      page: 1,
      limit: 10,
      totalPages: 1,
    });
  });

  it('getById fetches a single job', () => {
    service.getById('job-1').subscribe(data => {
      expect(data.id).toBe('job-1');
    });
    httpMock.expectOne('/api/jobs/job-1').flush({ id: 'job-1', status: 'completed' });
  });
});
