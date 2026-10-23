import { ChangeDetectionStrategy, Component } from '@angular/core';

/** Placeholder so the route loads; the full TFSA vs taxable page replaces it. */
@Component({
  selector: 'rw-tfsa-compare-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<h2>TFSA vs taxable account</h2>',
})
export class TfsaComparePage {}
