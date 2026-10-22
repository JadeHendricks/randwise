import { ChangeDetectionStrategy, Component, ViewEncapsulation, inject } from '@angular/core';

import { ThemePreference, ThemeService } from '../../../core/services/theme.service';
import { Icon, IconName } from '../../atoms/icon/icon';

interface ThemeOption {
  readonly value: ThemePreference;
  readonly label: string;
  readonly icon: IconName;
}

/** Segmented light / dark / system switch built on native radios for free arrow-key support. */
@Component({
  selector: 'rw-theme-toggle',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-theme-toggle' },
  template: `
    <fieldset class="rw-theme-toggle__group">
      <legend class="rw-visually-hidden">Theme</legend>
      @for (option of options; track option.value) {
        <label
          class="rw-theme-toggle__option"
          [class.rw-theme-toggle__option--active]="theme.preference() === option.value"
        >
          <input
            class="rw-theme-toggle__input"
            type="radio"
            name="rw-theme"
            [value]="option.value"
            [checked]="theme.preference() === option.value"
            (change)="theme.setPreference(option.value)"
          />
          <span class="rw-theme-toggle__face">
            <rw-icon [name]="option.icon" size="sm" />
            <span class="rw-theme-toggle__text">{{ option.label }}</span>
          </span>
        </label>
      }
    </fieldset>
  `,
})
export class ThemeToggle {
  protected readonly theme = inject(ThemeService);
  protected readonly options: readonly ThemeOption[] = [
    { value: 'light', label: 'Light', icon: 'sun' },
    { value: 'dark', label: 'Dark', icon: 'moon' },
    { value: 'system', label: 'System', icon: 'system' },
  ];
}
