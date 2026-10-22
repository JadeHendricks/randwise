export interface FakeMatchMedia {
  setDark(value: boolean): void;
  setReducedMotion(value: boolean): void;
  uninstall(): void;
}

interface Entry {
  query: string;
  list: { matches: boolean; listeners: Set<(e: MediaQueryListEvent) => void> };
}

/** jsdom has no matchMedia; this installs a controllable fake on window. */
export function installFakeMatchMedia(
  initial: { dark?: boolean; reducedMotion?: boolean } = {},
): FakeMatchMedia {
  const state = { dark: initial.dark ?? false, reducedMotion: initial.reducedMotion ?? false };
  const entries: Entry[] = [];
  const original = window.matchMedia;

  const valueFor = (query: string) =>
    query.includes('prefers-color-scheme: dark')
      ? state.dark
      : query.includes('prefers-reduced-motion: reduce')
        ? state.reducedMotion
        : false;

  window.matchMedia = ((query: string) => {
    const list = { matches: valueFor(query), listeners: new Set<(e: MediaQueryListEvent) => void>() };
    entries.push({ query, list });
    return {
      get matches() {
        return list.matches;
      },
      media: query,
      addEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) => list.listeners.add(fn),
      removeEventListener: (_: string, fn: (e: MediaQueryListEvent) => void) =>
        list.listeners.delete(fn),
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;

  const fire = () => {
    for (const { query, list } of entries) {
      const next = valueFor(query);
      if (next !== list.matches) {
        list.matches = next;
        list.listeners.forEach((fn) => fn({ matches: next, media: query } as MediaQueryListEvent));
      }
    }
  };

  return {
    setDark(value) {
      state.dark = value;
      fire();
    },
    setReducedMotion(value) {
      state.reducedMotion = value;
      fire();
    },
    uninstall() {
      window.matchMedia = original;
    },
  };
}
