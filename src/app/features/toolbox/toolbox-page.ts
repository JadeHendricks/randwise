import { ChangeDetectionStrategy, Component } from '@angular/core';

import { TOOLBOX_TOOLS } from '../../core/navigation/toolbox-tools';
import { BentoTile } from '../../shared/molecules/bento-tile/bento-tile';

/** The Toolbox landing: one tile for each of the four calculators. */
@Component({
  selector: 'rw-toolbox-page',
  imports: [BentoTile],
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './toolbox-page.scss',
  template: `
    <section class="toolbox" aria-label="Toolbox">
      <p class="toolbox__intro">
        Four small calculators for common money questions. Each one starts from an example and
        follows your Pay page where it can.
      </p>
      <div class="toolbox__tiles">
        @for (tool of tools; track tool.path) {
          <rw-bento-tile [item]="tool" />
        }
      </div>
      <p class="toolbox__note">
        Estimates only, not advice. Nothing is saved: your figures stay in this tab and disappear
        when you close it.
      </p>
    </section>
  `,
})
export class ToolboxPage {
  protected readonly tools = TOOLBOX_TOOLS;
}
