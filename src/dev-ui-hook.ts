export interface UiBuildWatcher {
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
