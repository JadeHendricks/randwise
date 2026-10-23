import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  InjectionToken,
  ViewEncapsulation,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';

/**
 * How long, in milliseconds, a live region stays quiet after it speaks. Inside that window later
 * changes collapse into one update with the latest text. 0 turns the throttle off, which keeps
 * specs synchronous.
 */
export const LIVE_REGION_SETTLE_MS = new InjectionToken<number>('LIVE_REGION_SETTLE_MS', {
  providedIn: 'root',
  factory: () => 800,
});

/**
 * A polite, visually hidden live region. Dragging a slider or typing changes the text on every
 * event, which a screen reader would read as a burst. The first change speaks at once, then at
 * most one more update follows per settle window, carrying the newest text. An empty text
 * clears the region immediately.
 */
@Component({
  selector: 'rw-live-region',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-live-region' },
  template: `<p class="rw-visually-hidden" aria-live="polite" aria-atomic="true">{{ shown() }}</p>`,
})
export class LiveRegion {
  readonly text = input.required<string>();

  private readonly settleMs = inject(LIVE_REGION_SETTLE_MS);
  private readonly spoken = signal('');
  private timer: ReturnType<typeof setTimeout> | undefined;
  private pending: string | null = null;

  protected readonly shown = computed(() => (this.settleMs <= 0 ? this.text() : this.spoken()));

  constructor() {
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
    effect(() => {
      const value = this.text();
      if (this.settleMs > 0) untracked(() => this.push(value));
    });
  }

  private push(value: string): void {
    if (value === '') {
      this.stop();
      this.spoken.set('');
    } else if (this.timer === undefined) {
      this.spoken.set(value);
      this.openWindow();
    } else {
      this.pending = value;
    }
  }

  private openWindow(): void {
    this.timer = setTimeout(() => {
      this.timer = undefined;
      if (this.pending !== null) {
        this.spoken.set(this.pending);
        this.pending = null;
        this.openWindow();
      }
    }, this.settleMs);
  }

  private stop(): void {
    clearTimeout(this.timer);
    this.timer = undefined;
    this.pending = null;
  }
}
