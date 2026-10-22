import { ChangeDetectionStrategy, Component, ViewEncapsulation, computed, input } from '@angular/core';

export type IconName =
  | 'dashboard'
  | 'pay'
  | 'ra'
  | 'retire'
  | 'budget'
  | 'journey'
  | 'plan'
  | 'toolbox'
  | 'sun'
  | 'moon'
  | 'system'
  | 'close'
  | 'arrow-right';

export type IconSize = 'sm' | 'md' | 'lg';

// Inline 24x24 stroke paths so no icon library or network request is needed.
const PATHS: Record<IconName, readonly string[]> = {
  dashboard: ['M4 4h6v6H4z', 'M14 4h6v6h-6z', 'M4 14h6v6H4z', 'M14 14h6v6h-6z'],
  pay: [
    'M3 7a2 2 0 0 1 2-2h13v4',
    'M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-2',
    'M16 14h2',
  ],
  ra: ['M12 3l8 3v6c0 4.5-3.4 7.7-8 9-4.6-1.3-8-4.5-8-9V6z', 'M9 12l2 2 4-4'],
  retire: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  budget: ['M21 12a9 9 0 1 1-9-9', 'M12 3v9h9'],
  journey: [
    'M6 19a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    'M18 9a2 2 0 1 0 0-4 2 2 0 0 0 0 4z',
    'M8 17h6a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h6',
  ],
  plan: ['M9 6h11', 'M9 12h11', 'M9 18h11', 'M4 6l1 1 2-2', 'M4 12l1 1 2-2', 'M4 18l1 1 2-2'],
  toolbox: ['M3 8h18v11H3z', 'M9 8V5h6v3', 'M3 13h18'],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M12 2v2',
    'M12 20v2',
    'M4.9 4.9l1.4 1.4',
    'M17.7 17.7l1.4 1.4',
    'M2 12h2',
    'M20 12h2',
    'M4.9 19.1l1.4-1.4',
    'M17.7 6.3l1.4-1.4',
  ],
  moon: ['M20 14.5A8 8 0 0 1 9.5 4 8 8 0 1 0 20 14.5z'],
  system: ['M3 5h18v11H3z', 'M8 20h8', 'M12 16v4'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  'arrow-right': ['M5 12h14', 'M13 6l6 6-6 6'],
};

@Component({
  selector: 'rw-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: {
    class: 'rw-icon',
    '[class.rw-icon--sm]': "size() === 'sm'",
    '[class.rw-icon--md]': "size() === 'md'",
    '[class.rw-icon--lg]': "size() === 'lg'",
    '[attr.aria-hidden]': 'label() ? null : "true"',
    '[attr.role]': 'label() ? "img" : null',
    '[attr.aria-label]': 'label() || null',
  },
  template: `
    <svg
      class="rw-icon__svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1.8"
      stroke-linecap="round"
      stroke-linejoin="round"
      focusable="false"
    >
      @for (d of paths(); track d) {
        <path [attr.d]="d" />
      }
    </svg>
  `,
})
export class Icon {
  readonly name = input.required<IconName>();
  readonly size = input<IconSize>('md');
  /** When set the icon is exposed to assistive tech; otherwise it is decorative. */
  readonly label = input<string>('');

  protected readonly paths = computed(() => PATHS[this.name()]);
}
