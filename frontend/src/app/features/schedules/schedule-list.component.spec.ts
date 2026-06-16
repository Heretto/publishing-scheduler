import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { RouterTestingModule } from '@angular/router/testing';
import { ScheduleListComponent } from './schedule-list.component';

describe('ScheduleListComponent', () => {
  let component: ScheduleListComponent;
  let fixture: ComponentFixture<ScheduleListComponent>;
  let httpMock: HttpTestingController;

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
    httpMock.expectOne('/api/schedules').flush([
      { id: '1', name: 'S1', enabled: true, cron_expression: '0 9 * * *' },
    ]);

    expect(component.schedules.length).toBe(1);
    expect(component.loading).toBe(false);
  });

  it('should handle load error', () => {
    fixture.detectChanges();
    httpMock.expectOne('/api/schedules').error(new ProgressEvent('error'));

    expect(component.schedules.length).toBe(0);
    expect(component.loading).toBe(false);
  });
});
