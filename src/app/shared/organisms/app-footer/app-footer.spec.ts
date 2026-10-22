import { TestBed } from '@angular/core/testing';

import { AppFooter } from './app-footer';

describe('AppFooter', () => {
  it('always shows the disclaimer inside a footer landmark', async () => {
    const fixture = TestBed.createComponent(AppFooter);
    await fixture.whenStable();
    const footer = (fixture.nativeElement as HTMLElement).querySelector('footer');
    expect(footer?.textContent).toContain('Estimates only, not financial advice.');
    expect(footer?.textContent).toContain('Nothing you enter is saved.');
  });
});
