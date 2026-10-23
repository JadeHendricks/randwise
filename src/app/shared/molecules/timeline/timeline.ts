import { ChangeDetectionStrategy, Component, ViewEncapsulation, input } from '@angular/core';

/** One step on the timeline. `id` keeps the row stable when the list changes. */
export interface TimelineItem {
  readonly id: string;
  readonly title: string;
  readonly detail: string;
}

/**
 * A vertical journey timeline. It is an ordered list, so a screen reader announces "list, N items"
 * and the order of the steps; the line and dots are decoration only.
 */
@Component({
  selector: 'rw-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-timeline' },
  template: `
    <!-- role="list" restores the list semantics Safari drops when list-style is none. -->
    <ol class="rw-timeline__list" role="list">
      @for (item of items(); track item.id) {
        <li class="rw-timeline__item">
          <span class="rw-timeline__marker" aria-hidden="true"></span>
          <h3 class="rw-timeline__title">{{ item.title }}</h3>
          <p class="rw-timeline__detail">{{ item.detail }}</p>
        </li>
      }
    </ol>
  `,
})
export class Timeline {
  readonly items = input.required<readonly TimelineItem[]>();
}
