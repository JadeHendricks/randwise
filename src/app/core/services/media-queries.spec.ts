import { TestBed } from '@angular/core/testing';

import { FakeMatchMedia, installFakeMatchMedia } from '../../testing/fake-match-media';
import { MediaQueries } from './media-queries';

describe('MediaQueries', () => {
  let fake: FakeMatchMedia;

  afterEach(() => fake.uninstall());

  it('reads initial values from matchMedia', () => {
    fake = installFakeMatchMedia({ dark: true, reducedMotion: false });
    const media = TestBed.inject(MediaQueries);
    expect(media.prefersDark()).toBe(true);
    expect(media.prefersReducedMotion()).toBe(false);
  });

  it('updates signals when the query changes', () => {
    fake = installFakeMatchMedia();
    const media = TestBed.inject(MediaQueries);
    fake.setDark(true);
    fake.setReducedMotion(true);
    expect(media.prefersDark()).toBe(true);
    expect(media.prefersReducedMotion()).toBe(true);
  });
});
