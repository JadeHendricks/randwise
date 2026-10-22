import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';

import { ThemeToggle } from '../../molecules/theme-toggle/theme-toggle';

@Component({
  selector: 'rw-app-header',
  imports: [ThemeToggle],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-app-header' },
  template: `
    <header class="rw-app-header__bar">
      <h1 class="rw-app-header__title">{{ heading() }}</h1>
      <!-- Reserved for a future data badge. Intentionally empty: no fake data. -->
      <div class="rw-app-header__data-badge" role="status" aria-label="Tax data status"></div>
      <rw-theme-toggle />
    </header>
  `,
})
export class AppHeader {
  readonly heading = input.required<string>();
}
