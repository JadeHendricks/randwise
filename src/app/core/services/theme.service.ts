import { DOCUMENT, Injectable, computed, effect, inject, signal } from '@angular/core';

import { MediaQueries } from './media-queries';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

/**
 * Holds the theme preference in memory only (never persisted) and mirrors the
 * resolved theme onto <html data-theme>. "system" follows prefers-color-scheme.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly root = inject(DOCUMENT).documentElement;
  private readonly media = inject(MediaQueries);
  private readonly state = signal<ThemePreference>('system');

  readonly preference = this.state.asReadonly();
  readonly resolved = computed<ResolvedTheme>(() => {
    const preference = this.state();
    if (preference === 'system') {
      return this.media.prefersDark() ? 'dark' : 'light';
    }
    return preference;
  });

  constructor() {
    effect(() => {
      const theme = this.resolved();
      this.root.dataset['theme'] = theme;
      // Keeps native controls (scrollbars, number spinners) in step with the theme.
      this.root.style.colorScheme = theme;
    });
  }

  setPreference(preference: ThemePreference): void {
    this.state.set(preference);
  }
}
