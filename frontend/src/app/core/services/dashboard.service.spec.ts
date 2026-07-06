import { TestBed } from '@angular/core/testing';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { DashboardService, DashboardSummary, LocaleStat } from './dashboard.service';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';

describe('DashboardService', () => {
  let service: DashboardService;
  let httpMock: HttpTestingController;

  const mockSummary: DashboardSummary = {
    per_schedule_stats: {
      'sched-1': { total: 10, succeeded: 8, failed: 2 },
    },
    daily_volumes: Array.from({ length: 14 }, (_, i) => ({
      date: `2026-06-${String(10 + i).padStart(2, '0')}`,
      total: i,
      succeeded: i,
      failed: 0,
    })),
    top_locales: {
      'en-us': { total: 24, succeeded: 20, failed: 4, top_schedules: [] } as LocaleStat,
      'fr-fr': { total: 18, succeeded: 15, failed: 3, top_schedules: [] } as LocaleStat,
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
    imports: [],
    providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()]
});
    service = TestBed.inject(DashboardService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // ── getSummary ────────────────────────────────────────────────────────────

  it('getSummary sends GET to /api/v1/dashboard/summary', () => {
    service.getSummary().subscribe();
    const req = httpMock.expectOne('/api/v1/dashboard/summary');
    expect(req.request.method).toBe('GET');
    req.flush(mockSummary);
  });

  it('getSummary returns the parsed summary object', () => {
    service.getSummary().subscribe(data => {
      expect(data.per_schedule_stats['sched-1'].succeeded).toBe(8);
      expect(data.per_schedule_stats['sched-1'].failed).toBe(2);
      expect(data.daily_volumes.length).toBe(14);
      expect(data.top_locales['en-us'].total).toBe(24);
    });
    httpMock.expectOne('/api/v1/dashboard/summary').flush(mockSummary);
  });

  it('getSummary returns empty collections when server returns empty data', () => {
    const empty: DashboardSummary = {
      per_schedule_stats: {},
      daily_volumes: [],
      top_locales: {},
    };
    service.getSummary().subscribe(data => {
      expect(data.per_schedule_stats).toEqual({});
      expect(data.daily_volumes).toEqual([]);
      expect(data.top_locales).toEqual({});
    });
    httpMock.expectOne('/api/v1/dashboard/summary').flush(empty);
  });
});
