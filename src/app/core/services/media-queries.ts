import { DestroyRef, DOCUMENT, Injectable, Signal, inject, signal } from '@angular/core';

/** Reactive wrappers around the media queries the UI cares about. */
@Injectable({ providedIn: 'root' })
export class MediaQueries {
  private readonly win = inject(DOCUMENT).defaultView;
  private readonly destroyRef = inject(DestroyRef);

  readonly prefersDark: Signal<boolean> = this.watch('(prefers-color-scheme: dark)');
  readonly prefersReducedMotion: Signal<boolean> = this.watch('(prefers-reduced-motion: reduce)');

  private watch(query: string): Signal<boolean> {
    // jsdom and very old browsers have no matchMedia: treat as "no match".
    const list = this.win?.matchMedia?.(query);
    const state = signal(list?.matches ?? false);
    if (list) {
      const onChange = (event: MediaQueryListEvent) => state.set(event.matches);
      list.addEventListener('change', onChange);
      this.destroyRef.onDestroy(() => list.removeEventListener('change', onChange));
    }
    return state.asReadonly();
  }
}
