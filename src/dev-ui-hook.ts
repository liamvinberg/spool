export interface UiBuildWatcher {
	/**
	 * Every rebuild after the one the daemon started on.
	 *
	 * The watcher runs before the daemon binds, so it cannot be handed an
	 * emitter at birth; the caller registers once the daemon exists. The first
	 * completed build is the bundle the daemon comes up serving and is nobody's
	 * news.
	 */
	onRebuild(listener: () => void): void;
	close(): Promise<void>;
}

let startCheckoutUiWatcher: (() => Promise<UiBuildWatcher>) | undefined;

/** Checkout-only code registers this before importing the production CLI. */
export function registerCheckoutUiWatcher(start: () => Promise<UiBuildWatcher>): void {
	startCheckoutUiWatcher = start;
}

/** The published CLI sees no registration and therefore never imports Vite. */
export function startRegisteredUiWatcher(): Promise<UiBuildWatcher | undefined> {
	return startCheckoutUiWatcher?.() ?? Promise.resolve(undefined);
}
