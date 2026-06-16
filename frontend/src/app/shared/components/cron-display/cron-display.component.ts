import { Component, Input, OnChanges } from '@angular/core';
import cronstrue from 'cronstrue';

@Component({
  selector: 'app-cron-display',
  standalone: true,
  template: `<span [title]="expression">{{ humanReadable }}</span>`,
})
export class CronDisplayComponent implements OnChanges {
  @Input() expression = '';
  humanReadable = '';

  ngOnChanges() {
    try {
      this.humanReadable = cronstrue.toString(this.expression);
    } catch {
      this.humanReadable = this.expression;
    }
  }
}
