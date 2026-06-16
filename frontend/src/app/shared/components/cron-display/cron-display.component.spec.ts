import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CronDisplayComponent } from './cron-display.component';

describe('CronDisplayComponent', () => {
  let component: CronDisplayComponent;
  let fixture: ComponentFixture<CronDisplayComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CronDisplayComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(CronDisplayComponent);
    component = fixture.componentInstance;
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('should display human-readable cron', () => {
    component.expression = '0 9 * * *';
    component.ngOnChanges();
    expect(component.humanReadable).toContain('9');
  });

  it('should handle invalid cron expression', () => {
    component.expression = 'invalid';
    component.ngOnChanges();
    expect(component.humanReadable).toBe('invalid');
  });

  it('should handle empty expression', () => {
    component.expression = '';
    component.ngOnChanges();
    expect(component.humanReadable).toBe('');
  });
});
