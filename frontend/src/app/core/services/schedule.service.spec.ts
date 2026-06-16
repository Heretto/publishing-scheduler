import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ScheduleService, Schedule } from './schedule.service';

describe('ScheduleService', () => {
  let service: ScheduleService;
  let httpMock: HttpTestingController;

  const mockSchedule: Schedule = {
    id: '1',
    name: 'Test',
    description: '',
    cron_expression: '0 9 * * *',
    scenario_id: 's1',
    deployment_id: 'd1',
    document_ids: [],
    enabled: true,
    last_run_at: null,
    last_run_status: null,
    created_at: '2024-01-01',
    updated_at: '2024-01-01',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(ScheduleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('getAll fetches schedules', () => {
    service.getAll().subscribe(data => {
      expect(data.length).toBe(1);
      expect(data[0].name).toBe('Test');
    });
    httpMock.expectOne('/api/schedules').flush([mockSchedule]);
  });

  it('getById fetches a single schedule', () => {
    service.getById('1').subscribe(data => {
      expect(data.id).toBe('1');
    });
    httpMock.expectOne('/api/schedules/1').flush(mockSchedule);
  });

  it('create posts a new schedule', () => {
    const input = { name: 'New', cron_expression: '0 9 * * *', scenario_id: 's1', deployment_id: 'd1' };
    service.create(input).subscribe();
    const req = httpMock.expectOne('/api/schedules');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.name).toBe('New');
    req.flush(mockSchedule);
  });

  it('update puts updated schedule', () => {
    service.update('1', { name: 'Updated' }).subscribe();
    const req = httpMock.expectOne('/api/schedules/1');
    expect(req.request.method).toBe('PUT');
    req.flush(mockSchedule);
  });

  it('delete removes a schedule', () => {
    service.delete('1').subscribe();
    const req = httpMock.expectOne('/api/schedules/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  it('toggle patches enabled state', () => {
    service.toggle('1', false).subscribe();
    const req = httpMock.expectOne('/api/schedules/1/toggle');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ enabled: false });
    req.flush(mockSchedule);
  });

  it('trigger posts to trigger endpoint', () => {
    service.trigger('1').subscribe();
    const req = httpMock.expectOne('/api/schedules/1/trigger');
    expect(req.request.method).toBe('POST');
    req.flush({});
  });
});
