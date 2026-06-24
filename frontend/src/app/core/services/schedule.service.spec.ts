import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ScheduleService, Schedule, CreateScheduleInput } from './schedule.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('ScheduleService', () => {
  let service: ScheduleService;
  let httpMock: HttpTestingController;

  const mockSchedule: Schedule = {
    id: '1',
    name: 'Test',
    description: 'Test description',
    cron_expression: '0 9 * * *',
    scenario_ids: ['500009', '500010'],
    deployment_id: 'd1',
    document_ids: ['doc-1'],
    folder_ids: [],
    document_releases: {},
    enabled: true,
    branch: 'master',
    locales: ['fr-fr'],
    publish_parameters: [],
    last_run_at: null,
    last_run_status: null,
    consecutive_failures: 0,
    next_run_time: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(ScheduleService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ── getAll ────────────────────────────────────────────────────────────────

  it('getAll fetches schedules list', () => {
    service.getAll().subscribe(data => {
      expect(data.length).toBe(1);
      expect(data[0].name).toBe('Test');
    });
    httpMock.expectOne('/api/v1/schedules/').flush([mockSchedule]);
  });

  it('getAll returns schedule with scenario_ids array', () => {
    service.getAll().subscribe(data => {
      expect(data[0].scenario_ids).toEqual(['500009', '500010']);
    });
    httpMock.expectOne('/api/v1/schedules/').flush([mockSchedule]);
  });

  it('getAll returns schedule with locales array', () => {
    service.getAll().subscribe(data => {
      expect(data[0].locales).toEqual(['fr-fr']);
    });
    httpMock.expectOne('/api/v1/schedules/').flush([mockSchedule]);
  });

  // ── getById ───────────────────────────────────────────────────────────────

  it('getById fetches a single schedule', () => {
    service.getById('1').subscribe(data => {
      expect(data.id).toBe('1');
    });
    httpMock.expectOne('/api/v1/schedules/1').flush(mockSchedule);
  });

  // ── create ────────────────────────────────────────────────────────────────

  it('create posts with scenario_ids array', () => {
    const input: CreateScheduleInput = {
      name: 'New',
      cron_expression: '0 9 * * *',
      scenario_ids: ['500009', '500010'],
      deployment_id: 'd1',
    };
    service.create(input).subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/');
    expect(req.request.method).toBe('POST');
    expect(req.request.body.scenario_ids).toEqual(['500009', '500010']);
    req.flush(mockSchedule);
  });

  it('create posts with locales array', () => {
    const input: CreateScheduleInput = {
      name: 'New',
      cron_expression: '0 9 * * *',
      scenario_ids: ['500009'],
      deployment_id: 'd1',
      locales: ['fr-fr', 'de-de'],
    };
    service.create(input).subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/');
    expect(req.request.body.locales).toEqual(['fr-fr', 'de-de']);
    req.flush(mockSchedule);
  });

  it('create posts with document_ids array', () => {
    const input: CreateScheduleInput = {
      name: 'New',
      cron_expression: '0 9 * * *',
      scenario_ids: ['500009'],
      deployment_id: 'd1',
      document_ids: ['doc-1', 'doc-2'],
    };
    service.create(input).subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/');
    expect(req.request.body.document_ids).toEqual(['doc-1', 'doc-2']);
    req.flush(mockSchedule);
  });

  // ── update ────────────────────────────────────────────────────────────────

  it('update sends PUT with updated fields', () => {
    service.update('1', { name: 'Updated', scenario_ids: ['500011'] }).subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/1');
    expect(req.request.method).toBe('PUT');
    expect(req.request.body.name).toBe('Updated');
    expect(req.request.body.scenario_ids).toEqual(['500011']);
    req.flush(mockSchedule);
  });

  it('update can change locales', () => {
    service.update('1', { locales: ['de-de'] }).subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/1');
    expect(req.request.body.locales).toEqual(['de-de']);
    req.flush(mockSchedule);
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it('delete sends DELETE request', () => {
    service.delete('1').subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/1');
    expect(req.request.method).toBe('DELETE');
    req.flush(null);
  });

  // ── toggle ────────────────────────────────────────────────────────────────

  it('toggle patches enabled=true', () => {
    service.toggle('1', true).subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/1/toggle');
    expect(req.request.method).toBe('PATCH');
    expect(req.request.body).toEqual({ enabled: true });
    req.flush(mockSchedule);
  });

  it('toggle patches enabled=false', () => {
    service.toggle('1', false).subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/1/toggle');
    expect(req.request.body).toEqual({ enabled: false });
    req.flush({ ...mockSchedule, enabled: false });
  });

  // ── trigger ───────────────────────────────────────────────────────────────

  it('trigger posts to the trigger endpoint', () => {
    service.trigger('1').subscribe();
    const req = httpMock.expectOne('/api/v1/schedules/1/trigger');
    expect(req.request.method).toBe('POST');
    req.flush({ id: 'job-1', status: 'running' });
  });
});
