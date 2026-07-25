import type { MachineStateWatchAdapter } from "./session";

interface SubscribeHooks {
	beforeSubscribe?(): void;
	afterSubscribe?(changed: (filename: string | null) => void): void;
}

/** Deterministic filesystem-watch boundary for daemon session tests. */
export function createMachineStateWatchHarness(hooks: SubscribeHooks = {}): {
	adapter: MachineStateWatchAdapter;
	changed(filename: string | null): void;
	failed(error: Error): void;
	flush(): void;
} {
	let changeListener: ((filename: string | null) => void) | undefined;
	let errorListener: ((error: Error) => void) | undefined;
	const scheduled = new Set<() => void>();

	return {
		adapter: {
			subscribe: (_spoolDir, changed, failed) => {
				hooks.beforeSubscribe?.();
				changeListener = changed;
				errorListener = failed;
				hooks.afterSubscribe?.(changed);
				return {
					close: () => {
						changeListener = undefined;
						errorListener = undefined;
					},
				};
			},
			schedule: (reconcile) => {
				scheduled.add(reconcile);
				return { cancel: () => scheduled.delete(reconcile) };
			},
		},
		changed: (filename) => {
			if (changeListener === undefined) throw new Error("machine-state watch is not subscribed");
			changeListener(filename);
		},
		failed: (error) => {
			if (errorListener === undefined) throw new Error("machine-state watch is not subscribed");
			errorListener(error);
		},
		flush: () => {
			for (const reconcile of [...scheduled]) {
				scheduled.delete(reconcile);
				reconcile();
			}
		},
	};
}
