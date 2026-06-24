import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { DashboardComponent } from './dashboard.component';
import { Schedule } from '../../core/services/schedule.service';
import { DashboardSummary } from '../../core/services/dashboard.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

// ── shared test data ───────────────────────────────────────────────────────────

const mockSchedule: Schedule = {
  id: '1',
  name: 'Test Schedule',
  description: 'Runs nightly',
  cron_expression: '0 9 * * *',
  scenario_ids: ['500009'],
  deployment_id: 'd1',
  document_ids: ['doc-1'],
  folder_ids: [],
  document_releases: {},
  enabled: true,
  branch: 'master',
  locales: ['en-us'],
  publish_parameters: [],
  last_run_at: null,
  last_run_status: null,
  consecutive_failures: 0,
  next_run_time: null,
  created_at: '2024-01-01T00:00:00Z',
  updated_at: '2024-01-01T00:00:00Z',
};

const mockSummary: DashboardSummary = {
  per_schedule_stats: {
    '1': { total: 10, succeeded: 8, failed: 2 },
  },
  daily_volumes: Array.from({ length: 14 }, (_, i) => ({
    date: `2026-06-${String(10 + i).padStart(2, '0')}`,
    total: i + 1,
    succeeded: i + 1,
    failed: 0,
  })),
  top_locales: { 'en-us': 24, 'fr-fr': 18, 'de-de': 10 },
};

const mockJobsResponse = {
  data: [{ id: 'j1', status: 'completed', schedule_id: '1', schedule_name: 'Test' }],
  total: 1,
  page: 1,
  limit: 30,
  totalPages: 1,
};

/** Flush the three forkJoin init requests in any order. */
function flushInitRequests(
  httpMock: HttpTestingController,
  schedules: Schedule[] = [mockSchedule],
  jobs = mockJobsResponse,
  summary: DashboardSummary = mockSummary,
) {
  httpMock.expectOne('/api/v1/schedules/').flush(schedules);
  httpMock.expectOne('/api/v1/jobs/?limit=30').flush(jobs);
  httpMock.expectOne('/api/v1/dashboard/summary').flush(summary);
}

// ── suite ──────────────────────────────────────────────────────────────────────

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
    imports: [DashboardComponent, NoopAnimationsModule, RouterTestingModule],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
}).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ── init / HTTP integration ────────────────────────────────────────────────

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('loads schedules, jobs, and summary in parallel on init', () => {
    fixture.detectChanges();

    flushInitRequests(httpMock,
      [
        { ...mockSchedule, enabled: true },
        { ...mockSchedule, id: '2', enabled: false },
      ],
      mockJobsResponse,
      mockSummary,
    );

    expect(component.schedules.length).toBe(2);
    expect(component.activeSchedules).toBe(1);
    expect(component.totalSchedules).toBe(2);
    expect(component.recentJobs.length).toBe(1);
    expect(component.totalJobs).toBe(1);
    expect(component.summary).toEqual(mockSummary);
    expect(component.loading).toBe(false);
  });

  it('shows error and clears loading when any init request fails', () => {
    fixture.detectChanges();

    // Two succeed, one errors — forkJoin propagates the error
    httpMock.expectOne('/api/v1/schedules/').flush([mockSchedule]);
    httpMock.expectOne('/api/v1/jobs/?limit=30').flush(mockJobsResponse);
    httpMock.expectOne('/api/v1/dashboard/summary').error(new ProgressEvent('error'));

    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBeTruthy();
  });

  it('fetches 30 jobs (not 10) for better success-rate signal', () => {
    fixture.detectChanges();
    const jobsReq = httpMock.expectOne((req) => req.url.includes('/api/v1/jobs/'));
    expect(jobsReq.request.params.get('limit')).toBe('30');
    jobsReq.flush(mockJobsResponse);
    httpMock.expectOne('/api/v1/schedules/').flush([]);
    httpMock.expectOne('/api/v1/dashboard/summary').flush(mockSummary);
  });

  // ── successRate ────────────────────────────────────────────────────────────

  it('successRate returns 0 with no jobs', () => {
    expect(component.successRate).toBe(0);
  });

  it('successRate calculates correctly from recent jobs', () => {
    component.recentJobs = [
      { status: 'completed' } as any,
      { status: 'completed' } as any,
      { status: 'failed' } as any,
      { status: 'failed' } as any,
    ];
    expect(component.successRate).toBe(50);
  });

  // ── needsAttentionSchedules ────────────────────────────────────────────────

  it('needsAttentionSchedules is empty when no failures', () => {
    component.schedules = [{ ...mockSchedule, consecutive_failures: 0 }];
    expect(component.needsAttentionSchedules.length).toBe(0);
  });

  it('needsAttentionSchedules includes schedules with consecutive failures', () => {
    component.schedules = [
      { ...mockSchedule, id: '1', consecutive_failures: 0 },
      { ...mockSchedule, id: '2', consecutive_failures: 3 },
    ];
    expect(component.needsAttentionSchedules.length).toBe(1);
    expect(component.needsAttentionSchedules[0].id).toBe('2');
  });

  it('needsAttentionSchedules treats null consecutive_failures as 0', () => {
    component.schedules = [{ ...mockSchedule, consecutive_failures: null }];
    expect(component.needsAttentionSchedules.length).toBe(0);
  });

  // ── staleSchedules ─────────────────────────────────────────────────────────

  it('staleSchedules excludes disabled schedules', () => {
    component.schedules = [{ ...mockSchedule, enabled: false, last_run_at: null }];
    expect(component.staleSchedules.length).toBe(0);
  });

  it('staleSchedules includes enabled schedule that has never run', () => {
    component.schedules = [{ ...mockSchedule, enabled: true, last_run_at: null, next_run_time: null }];
    expect(component.staleSchedules.length).toBe(1);
  });

  it('staleSchedules excludes schedule with no next_run_time but has run before', () => {
    component.schedules = [{
      ...mockSchedule,
      enabled: true,
      last_run_at: '2026-06-20T09:00:00Z',
      next_run_time: null,
    }];
    expect(component.staleSchedules.length).toBe(0);
  });

  it('staleSchedules flags schedule whose last run was more than 3× the interval ago', () => {
    const now = new Date();
    const nextHour = new Date(now.getTime() + 3_600_000).toISOString();
    const fourHoursAgo = new Date(now.getTime() - 4 * 3_600_000).toISOString();

    component.schedules = [{
      ...mockSchedule,
      enabled: true,
      last_run_at: fourHoursAgo,
      next_run_time: nextHour,
    }];
    // interval = 1h; 4h since last run > 3 × 1h = stale
    expect(component.staleSchedules.length).toBe(1);
  });

  it('staleSchedules does not flag schedule whose last run was within 3× the interval', () => {
    const now = new Date();
    const nextHour = new Date(now.getTime() + 3_600_000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000).toISOString();

    component.schedules = [{
      ...mockSchedule,
      enabled: true,
      last_run_at: twoHoursAgo,
      next_run_time: nextHour,
    }];
    // interval = 1h; 2h since last run < 3 × 1h = not stale
    expect(component.staleSchedules.length).toBe(0);
  });

  it('staleSchedules excludes overdue schedules (next_run_time in the past)', () => {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 3_600_000).toISOString();
    const twoHoursAgo = new Date(now.getTime() - 2 * 3_600_000).toISOString();

    component.schedules = [{
      ...mockSchedule,
      enabled: true,
      last_run_at: twoHoursAgo,
      next_run_time: oneHourAgo,  // already past due
    }];
    expect(component.staleSchedules.length).toBe(0);
  });

  // ── scheduleSuccessRate ────────────────────────────────────────────────────

  it('scheduleSuccessRate returns null when summary is not loaded', () => {
    component.summary = null;
    expect(component.scheduleSuccessRate('1')).toBeNull();
  });

  it('scheduleSuccessRate returns null for unknown schedule id', () => {
    component.summary = mockSummary;
    expect(component.scheduleSuccessRate('unknown-id')).toBeNull();
  });

  it('scheduleSuccessRate returns null when total is 0', () => {
    component.summary = {
      ...mockSummary,
      per_schedule_stats: { '1': { total: 0, succeeded: 0, failed: 0 } },
    };
    expect(component.scheduleSuccessRate('1')).toBeNull();
  });

  it('scheduleSuccessRate computes percentage rounded to nearest integer', () => {
    component.summary = {
      ...mockSummary,
      per_schedule_stats: { '1': { total: 3, succeeded: 2, failed: 1 } },
    };
    expect(component.scheduleSuccessRate('1')).toBe(67);
  });

  it('scheduleSuccessRate returns 100 for perfect record', () => {
    component.summary = {
      ...mockSummary,
      per_schedule_stats: { '1': { total: 5, succeeded: 5, failed: 0 } },
    };
    expect(component.scheduleSuccessRate('1')).toBe(100);
  });

  // ── topLocales ─────────────────────────────────────────────────────────────

  it('topLocales returns empty array when summary is null', () => {
    component.summary = null;
    expect(component.topLocales).toEqual([]);
  });

  it('topLocales returns entries sorted by count descending', () => {
    component.summary = {
      ...mockSummary,
      top_locales: { 'fr-fr': 18, 'en-us': 24, 'de-de': 10 },
    };
    const locales = component.topLocales;
    expect(locales[0].code).toBe('en-us');
    expect(locales[0].count).toBe(24);
    expect(locales[1].code).toBe('fr-fr');
    expect(locales[2].code).toBe('de-de');
  });

  // ── sparkline helpers ──────────────────────────────────────────────────────

  it('sparkMaxJobs returns 1 when summary is null', () => {
    component.summary = null;
    expect(component.sparkMaxJobs).toBe(1);
  });

  it('sparkMaxJobs returns the maximum daily total', () => {
    component.summary = {
      ...mockSummary,
      daily_volumes: [
        { date: '2026-06-22', total: 5, succeeded: 5, failed: 0 },
        { date: '2026-06-23', total: 12, succeeded: 10, failed: 2 },
        { date: '2026-06-24', total: 3, succeeded: 3, failed: 0 },
      ],
    };
    expect(component.sparkMaxJobs).toBe(12);
  });

  it('barHeight is proportional to sparkMaxJobs, max 46', () => {
    component.summary = {
      ...mockSummary,
      daily_volumes: [{ date: '2026-06-23', total: 10, succeeded: 10, failed: 0 }],
    };
    const height = component.barHeight({ date: '2026-06-23', total: 10, succeeded: 10, failed: 0 });
    expect(height).toBe(46);
  });

  it('barHeight has a minimum of 2 for zero-job days', () => {
    component.summary = {
      ...mockSummary,
      daily_volumes: [{ date: '2026-06-23', total: 5, succeeded: 5, failed: 0 }],
    };
    const height = component.barHeight({ date: '2026-06-22', total: 0, succeeded: 0, failed: 0 });
    expect(height).toBe(2);
  });

  // ── triggerNow ─────────────────────────────────────────────────────────────

  it('triggerNow sets triggeringId while the request is in flight', () => {
    component.triggerNow(mockSchedule);
    expect(component.triggeringId).toBe(mockSchedule.id);
    // Clean up — flush the pending trigger and jobs refresh
    httpMock.expectOne(`/api/v1/schedules/${mockSchedule.id}/trigger`).flush({});
    httpMock.expectOne('/api/v1/jobs/?limit=30').flush(mockJobsResponse);
  });

  it('triggerNow clears triggeringId and refreshes jobs on success', () => {
    component.triggerNow(mockSchedule);

    httpMock.expectOne(`/api/v1/schedules/${mockSchedule.id}/trigger`)
      .flush({ id: 'job-new', status: 'running' });

    const refreshedJobs = {
      ...mockJobsResponse,
      data: [{ id: 'job-new', status: 'running' } as any],
      total: 2,
    };
    httpMock.expectOne('/api/v1/jobs/?limit=30').flush(refreshedJobs);

    expect(component.triggeringId).toBeNull();
    expect(component.recentJobs[0].id).toBe('job-new');
    expect(component.totalJobs).toBe(2);
  });

  it('triggerNow clears triggeringId on error', () => {
    component.triggerNow(mockSchedule);

    httpMock.expectOne(`/api/v1/schedules/${mockSchedule.id}/trigger`)
      .error(new ProgressEvent('error'));

    expect(component.triggeringId).toBeNull();
  });

  it('triggerNow is a no-op when another trigger is already in flight', () => {
    component.triggeringId = 'other-schedule-id';
    component.triggerNow(mockSchedule);

    httpMock.expectNone(`/api/v1/schedules/${mockSchedule.id}/trigger`);
  });
});
