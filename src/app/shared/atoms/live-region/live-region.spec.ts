import { TestBed } from '@angular/core/testing';
import { LIVE_REGION_SETTLE_MS, LiveRegion } from './live-region';

describe('LiveRegion', () => {
  function create(settleMs: number, text = '') {
    TestBed.configureTestingModule({
      providers: [{ provide: LIVE_REGION_SETTLE_MS, useValue: settleMs }],
    });
    const fixture = TestBed.createComponent(LiveRegion);
    fixture.componentRef.setInput('text', text);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const region = root.querySelector('p') as HTMLElement;
    const history: string[] = [];
    const read = () => {
      fixture.detectChanges();
      const now = region.textContent ?? '';
      if (history.at(-1) !== now) history.push(now);
      return now;
    };
    const set = (value: string) => {
      fixture.componentRef.setInput('text', value);
      return read();
    };
    return { fixture, root, region, history, read, set };
  }

  afterEach(() => vi.useRealTimers());

  it('is a polite, atomic, visually hidden status paragraph', () => {
    const { root, region } = create(0);
    expect(root.classList).toContain('rw-live-region');
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.getAttribute('aria-atomic')).toBe('true');
    expect(region.classList).toContain('rw-visually-hidden');
  });

  it('is synchronous when the settle time is 0', () => {
    const { set } = create(0);
    expect(set('One')).toBe('One');
    expect(set('Two')).toBe('Two');
    expect(set('')).toBe('');
  });

  it('shows the first change at once', () => {
    vi.useFakeTimers();
    const { set } = create(800);
    expect(set('Net pay R 10 000.')).toBe('Net pay R 10 000.');
  });

  it('collapses ten rapid changes into one trailing update with the latest text', () => {
    vi.useFakeTimers();
    const { set, read, history } = create(800);
    set('First');
    for (let i = 1; i <= 10; i += 1) {
      vi.advanceTimersByTime(20);
      set(`Change ${i}`);
    }
    expect(read()).toBe('First');
    vi.advanceTimersByTime(800);
    expect(read()).toBe('Change 10');
    vi.advanceTimersByTime(5_000);
    expect(read()).toBe('Change 10');
    expect(history).toEqual(['First', 'Change 10']);
  });

  it('speaks a change that arrives after a quiet period straight away', () => {
    vi.useFakeTimers();
    const { set } = create(800);
    set('First');
    vi.advanceTimersByTime(2_000);
    expect(set('Later')).toBe('Later');
  });

  it('clears at once and drops any pending update', () => {
    vi.useFakeTimers();
    const { set, read } = create(800);
    set('First');
    set('Second');
    expect(set('')).toBe('');
    vi.advanceTimersByTime(2_000);
    expect(read()).toBe('');
    expect(set('Third')).toBe('Third');
  });

  it('stops its timer when destroyed', () => {
    vi.useFakeTimers();
    const { fixture, set } = create(800);
    set('First');
    set('Second');
    fixture.destroy();
    expect(vi.getTimerCount()).toBe(0);
  });
});
