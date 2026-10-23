import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

import { NAV_ITEMS } from '../../../core/navigation/nav-items';
import { Icon } from '../../atoms/icon/icon';

/** Primary navigation: a left icon rail on desktop, a bottom bar on mobile. */
@Component({
  selector: 'rw-icon-rail',
  imports: [Icon, RouterLink, RouterLinkActive],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-icon-rail' },
  template: `
    <nav class="rw-icon-rail__nav" aria-label="Primary">
      <span class="rw-icon-rail__brand" aria-hidden="true">R</span>
      <ul class="rw-icon-rail__list">
        @for (item of items; track item.path) {
          <li class="rw-icon-rail__item">
            <a
              class="rw-icon-rail__link"
              [routerLink]="'/' + item.path"
              routerLinkActive="rw-icon-rail__link--active"
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="{ exact: item.path === '' }"
            >
              <rw-icon [name]="item.icon" />
              <span class="rw-icon-rail__label">{{ item.label }}</span>
            </a>
          </li>
        }
      </ul>
    </nav>
  `,
})
export class IconRail {
  protected readonly items = NAV_ITEMS;
}
