import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder so the route loads; the full Two-pot withdrawal page replaces it. */
@Component({
  selector: 'rw-two-pot-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<h2>Two-pot withdrawal</h2>',
})
export class TwoPotPage {}
