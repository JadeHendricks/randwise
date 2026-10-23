import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  ViewEncapsulation,
  computed,
  inject,
  linkedSignal,
  viewChild,
} from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRouteSnapshot, NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter, map } from 'rxjs';

import { LiveRegion } from './shared/atoms/live-region/live-region';
import { DataBanner } from './shared/molecules/data-banner/data-banner';
import { AppFooter } from './shared/organisms/app-footer/app-footer';
import { AppHeader } from './shared/organisms/app-header/app-header';
import { IconRail } from './shared/organisms/icon-rail/icon-rail';

function deepestHeading(snapshot: ActivatedRouteSnapshot): string {
  let route = snapshot;
  while (route.firstChild) {
    route = route.firstChild;
  }
  return (route.data['heading'] as string | undefined) ?? 'Dashboard';
}

@Component({
  selector: 'rw-root',
  imports: [RouterOutlet, IconRail, AppHeader, DataBanner, AppFooter, LiveRegion],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Layout styles live in the global app-shell partial, not here.
  encapsulation: ViewEncapsulation.None,
  host: { class: 'rw-app-shell' },
  templateUrl: './app.html',
})
export class App {
  private readonly router = inject(Router);
  private readonly main = viewChild.required<ElementRef<HTMLElement>>('main');

  // Undefined until the first navigation finishes.
  private readonly current = toSignal(
    this.router.events.pipe(
      filter((event) => event instanceof NavigationEnd),
      map(() => deepestHeading(this.router.routerState.snapshot.root)),
    ),
  );

  protected readonly heading = computed(() => this.current() ?? 'Dashboard');

  // Tells screen reader users the page changed, since a single-page app has no page load. The first
  // navigation is the initial load and stays silent. Focus is not moved.
  protected readonly routeAnnouncement = linkedSignal<string | undefined, string>({
    source: this.current,
    computation: (next, previous) => (previous?.source && next ? `${next} page` : ''),
  });

  // A bare #hash link would resolve against <base href="/"> and leave the
  // current route, so move focus to <main> ourselves instead.
  protected skipToMain(event: Event): void {
    event.preventDefault();
    this.main().nativeElement.focus();
  }
}
