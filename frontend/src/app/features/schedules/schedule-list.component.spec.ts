import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { ScheduleListComponent } from './schedule-list.component';

describe('ScheduleListComponent', () => {
  let component: ScheduleListComponent;
  let fixture: ComponentFixture<ScheduleListComponent>;
  let httpMock: HttpTestingController;

  const mockSchedule = {
    id: '1',
    name: 'Daily HTML',
    description: '',
    cron_expression: '0 9 * * *',
    scenario_ids: ['500009'],
    deployment_id: 'd1',
    document_ids: ['doc-1'],
    enabled: true,
    branch: 'master',
    locales: [],
    publish_parameters: [],
    last_run_at: null,
    last_run_status: null,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ScheduleListComponent, HttpClientTestingModule, NoopAnimationsModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(ScheduleListComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load schedules on init', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/schedules/').flush([mockSchedule]);

    expect(component.schedules.length).toBe(1);
    expect(component.schedules[0].name).toBe('Daily HTML');
    expect(component.loading).toBe(false);
  });

  it('should handle empty schedule list', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/schedules/').flush([]);

    expect(component.schedules.length).toBe(0);
    expect(component.loading).toBe(false);
  });

  it('should handle load error gracefully', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/schedules/').error(new ProgressEvent('error'));

    expect(component.schedules.length).toBe(0);
    expect(component.loading).toBe(false);
  });

  it('should expose scenario_ids as array on loaded schedules', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/v1/schedules/').flush([mockSchedule]);

    expect(component.schedules[0].scenario_ids).toEqual(['500009']);
  });
});
