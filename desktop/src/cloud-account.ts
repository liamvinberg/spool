import type { MenuItemConstructorOptions } from "electron";

/** What the daemon's `GET /api/cloud/account` answers, the same account Home's foot shows. */
export type CloudAccountState =
	| { state: "signed-out" }
	| { state: "signing-in" }
	| { state: "signed-in"; email: string; accountUrl: string }
	/** Signed in as far as this Mac knows, but spool.page did not answer just now. */
	| { state: "unreachable" };

/** How long to wait before following the daemon again once its event stream has gone. */
export const RECONNECT_MS = 2_000;

/**
 * The Cloud Account submenu: Sign In… while signed out, the email and Sign Out while signed in.
 * Before the daemon has answered there is no account to show, and signing in is the one thing to offer.
 */
export function accountItems(
	account: CloudAccountState | undefined,
	actions: { signIn(): void; signOut(): void },
): MenuItemConstructorOptions[] {
	switch (account?.state) {
		case "signed-in":
			return [
				{ label: account.email, enabled: false },
				{ label: "Sign Out", click: actions.signOut },
			];
		case "unreachable":
			return [{ label: "Sign Out", click: actions.signOut }];
		case "signing-in":
			return [{ label: "Signing In…", enabled: false }];
		default:
			return [{ label: "Sign In…", click: actions.signIn }];
	}
}

/**
 * Follow the daemon's account: read it once the app's event stream is open, and again on every
 * `{ kind: "account" }` it sends, which signing in or out from Home, from this menu or from the
 * terminal all end in. A stream that ends (the daemon restarted or updated) is opened again.
 */
export function followAccount(
	origin: string,
	controlToken: string,
	onAccount: (account: CloudAccountState) => void,
	reconnectMs = RECONNECT_MS,
): { stop(): void } {
	const stopped = new AbortController();
	const headers = { "x-spool-control": controlToken };
	const read = async (): Promise<CloudAccountState> => {
		const response = await fetch(new URL("/api/cloud/account", origin), { headers, signal: stopped.signal });
		if (!response.ok) throw new Error(`account answered ${response.status}`);
		return (await response.json()) as CloudAccountState;
	};
	void (async () => {
		while (!stopped.signal.aborted) {
			try {
				const events = await fetch(new URL("/api/events", origin), { headers, signal: stopped.signal });
				if (!events.ok || events.body === null) throw new Error(`events answered ${events.status}`);
				// read after subscribing, so a change in between arrives as an event rather than being missed
				onAccount(await read());
				for await (const event of appEvents(events.body)) {
					if (event.kind === "account") onAccount(await read());
				}
			} catch {
				// a daemon that is gone or restarting: try again below
			}
			if (stopped.signal.aborted) return;
			await new Promise((resume) => setTimeout(resume, reconnectMs).unref());
		}
	})();
	return { stop: () => stopped.abort() };
}

/** The `app` events of the daemon's server-sent event stream, parsed. */
async function* appEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<{ kind?: string }> {
	const decoder = new TextDecoder();
	let buffer = "";
	for await (const chunk of body) {
		buffer += decoder.decode(chunk, { stream: true });
		const blocks = buffer.split("\n\n");
		buffer = blocks.pop() ?? "";
		for (const block of blocks) {
			const lines = block.split("\n");
			if (!lines.includes("event: app")) continue;
			const data = lines.find((line) => line.startsWith("data: "));
			if (data !== undefined) yield JSON.parse(data.slice("data: ".length)) as { kind?: string };
		}
	}
}
