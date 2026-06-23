import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { DashboardComponent } from './dashboard.component';

describe('DashboardComponent', () => {
  let component: DashboardComponent;
  let fixture: ComponentFixture<DashboardComponent>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DashboardComponent, HttpClientTestingModule, NoopAnimationsModule, RouterTestingModule],
    }).compileComponents();

    fixture = TestBed.createComponent(DashboardComponent);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should load schedules and jobs on init', () => {
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/schedules/').flush([
      { id: '1', name: 'S1', enabled: true, cron_expression: '0 9 * * *' },
      { id: '2', name: 'S2', enabled: false, cron_expression: '0 10 * * *' },
    ]);
    httpMock.expectOne('/api/v1/jobs/?limit=5').flush({ data: [{ id: 'j1', status: 'completed' }], total: 1 });

    expect(component.schedules.length).toBe(2);
    expect(component.activeSchedules).toBe(1);
    expect(component.totalSchedules).toBe(2);
    expect(component.recentJobs.length).toBe(1);
    expect(component.loading).toBe(false);
  });

  it('should handle schedule load error', () => {
    fixture.detectChanges();

    httpMock.expectOne('/api/v1/schedules/').error(new ProgressEvent('error'));
    httpMock.expectOne('/api/v1/jobs/?limit=5').flush({ data: [], total: 0 });

    expect(component.loading).toBe(false);
    expect(component.errorMessage).toBeTruthy();
  });
});
