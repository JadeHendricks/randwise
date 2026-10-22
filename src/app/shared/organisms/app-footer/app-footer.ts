import { ChangeDetectionStrategy, Component, ViewEncapsulation } from '@angular/core';

@Component({
  selector: 'rw-app-footer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-app-footer' },
  template: `
    <footer class="rw-app-footer__bar">
      <p class="rw-app-footer__text">Estimates only, not financial advice.</p>
      <p class="rw-app-footer__text">Nothing you enter is saved.</p>
    </footer>
  `,
})
export class AppFooter {}
