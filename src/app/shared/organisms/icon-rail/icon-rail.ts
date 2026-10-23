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
              #link
              class="rw-icon-rail__link"
              [routerLink]="'/' + item.path"
              routerLinkActive="rw-icon-rail__link--active"
              ariaCurrentWhenActive="page"
              [routerLinkActiveOptions]="{ exact: item.path === '' }"
              (isActiveChange)="onActiveChange($event, link)"
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

  /**
   * Why: the mobile bar scrolls sideways, so the current page's link can sit off screen. Scroll
   * the nav itself (instant, so reduced motion is respected). Element.scrollIntoView would also
   * move the browser's Tab starting point to this link, so the first Tab press after a page load
   * would skip the skip link and every nav link before it.
   */
  protected onActiveChange(active: boolean, link: HTMLElement): void {
    const nav = link.closest('nav');
    if (!active || !nav) return;
    const box = nav.getBoundingClientRect();
    const rect = link.getBoundingClientRect();
    nav.scrollLeft += rect.left + rect.width / 2 - (box.left + box.width / 2);
    if (rect.top < box.top) nav.scrollTop -= box.top - rect.top;
    else if (rect.bottom > box.bottom) nav.scrollTop += rect.bottom - box.bottom;
  }
}
