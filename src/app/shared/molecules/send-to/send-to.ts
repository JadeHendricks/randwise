import {
  ChangeDetectionStrategy,
  Component,
  ViewEncapsulation,
  computed,
  inject,
  input,
  output,
} from '@angular/core';
import { Router } from '@angular/router';
import { SEND_TARGETS, type SendTarget, type SendTargetId } from '../../../core/plan/handoff';
import { Button } from '../../atoms/button/button';
import { Icon } from '../../atoms/icon/icon';

let nextId = 0;

/**
 * "Send these figures to ..." row. A target with a route is a working button; one without is a
 * focusable, announced "Coming soon" button that does nothing, so there are no dead links.
 * Choosing a target emits `sendTo` first, so the parent can push the figures, then navigates.
 */
@Component({
  selector: 'rw-send-to',
  imports: [Button, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-send-to' },
  template: `
    <h2 class="rw-send-to__heading" [id]="headingId">{{ heading() }}</h2>
    <ul class="rw-send-to__list" [attr.aria-labelledby]="headingId">
      @for (target of visibleTargets(); track target.id) {
        <li class="rw-send-to__item">
          @if (target.route) {
            <button
              type="button"
              rw-button
              variant="primary"
              size="sm"
              class="rw-send-to__target"
              (click)="choose(target)"
            >
              {{ target.label }}
              <rw-icon name="arrow-right" size="sm" />
            </button>
          } @else {
            <button
              type="button"
              rw-button
              variant="ghost"
              size="sm"
              class="rw-send-to__target rw-send-to__target--soon"
              aria-disabled="true"
            >
              {{ target.label }}
              <span class="rw-send-to__soon">Coming soon</span>
            </button>
          }
        </li>
      }
    </ul>
  `,
})
export class SendTo {
  private readonly router = inject(Router);
  protected readonly headingId = `rw-send-to-heading-${nextId++}`;

  readonly heading = input('Send these figures to');
  readonly targets = input<readonly SendTarget[]>(SEND_TARGETS);
  /** A target to leave out, such as the page the figures are already on. */
  readonly exclude = input<SendTargetId | null>(null);
  readonly sendTo = output<SendTargetId>();

  protected readonly visibleTargets = computed(() =>
    this.targets().filter((target) => target.id !== this.exclude()),
  );

  protected choose(target: SendTarget): void {
    if (!target.route) return;
    this.sendTo.emit(target.id);
    void this.router.navigateByUrl(target.route);
  }
}
