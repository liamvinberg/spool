import { build, type InlineConfig } from "vite";
import type { UiBuildWatcher } from "./dev-ui-hook";

interface ViteWatcher extends UiBuildWatcher {
	on(event: "event", listener: (event: { code: string; error?: unknown }) => void): void;
}

/** Only the foreground child owns the checkout's UI watcher. */
export function watchesCheckoutUi(args: readonly string[]): boolean {
	return args[0] === "serve" && args.includes("--foreground");
}

/** Start Vite's production-output watcher and wait for its first completed cycle. */
export async function watchUiBuild(config: InlineConfig): Promise<UiBuildWatcher> {
	const result = await build({
		...config,
		build: { ...config.build, watch: {} },
	});
	const watcher = result as ViteWatcher;
	if (typeof watcher.on !== "function") throw new Error("Vite did not start a UI watcher");
	return new Promise<UiBuildWatcher>((resolve, reject) => {
		let settled = false;
		const fail = async (error: unknown) => {
			if (settled) return;
			settled = true;
			try {
				await watcher.close();
			} finally {
				reject(error);
			}
		};
		watcher.on("event", (event) => {
			if (event.code === "END" && !settled) {
				settled = true;
				resolve(watcher);
			}
			if (event.code === "ERROR") void fail(event.error ?? new Error("Vite failed to build the UI"));
		});
	});
}
