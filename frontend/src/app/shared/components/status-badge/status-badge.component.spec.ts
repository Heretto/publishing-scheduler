import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { StatusBadgeComponent } from './status-badge.component';

describe('StatusBadgeComponent', () => {
  let component: StatusBadgeComponent;
  let fixture: ComponentFixture<StatusBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusBadgeComponent, NoopAnimationsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(StatusBadgeComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should return check_circle icon for success', () => {
    component.status = 'success';
    expect(component.icon).toBe('check_circle');
  });

  it('should return error icon for failed', () => {
    component.status = 'failed';
    expect(component.icon).toBe('error');
  });

  it('should return sync icon for running', () => {
    component.status = 'running';
    expect(component.icon).toBe('sync');
  });

  it('should return empty string for unknown status', () => {
    component.status = 'unknown';
    expect(component.icon).toBe('');
  });

  it('should render the status text', () => {
    component.status = 'completed';
    fixture.detectChanges();
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Completed');
  });
});
