import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';

import { DataBadge } from '../../molecules/data-badge/data-badge';
import { ThemeToggle } from '../../molecules/theme-toggle/theme-toggle';

@Component({
  selector: 'rw-app-header',
  imports: [DataBadge, ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-app-header' },
  template: `
    <header class="rw-app-header__bar">
      <h1 class="rw-app-header__title">{{ heading() }}</h1>
      <div class="rw-app-header__data-badge">
        <rw-data-badge />
      </div>
      <rw-theme-toggle />
    </header>
  `,
})
export class AppHeader {
  readonly heading = input.required<string>();
}
