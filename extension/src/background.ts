import type { ReferenceOpened, ReferenceSent } from "../../src/reference-wire";
import type { Ask, OpenAnswer, PickerHandle, SendAnswer } from "./messages";

/**
 * The service worker: opens the picker in the tab (the toolbar icon, or ⌥⇧S through `_execute_action`) and carries
 * its captures to spool's daemon on this Mac. Requests leave from here so the daemon sees this extension's origin,
 * which no website can send.
 */

/** the installed spool's port; `chrome.storage.local` `ports` overrides it, tried in order (development, tests) */
const DEFAULT_PORTS = [7766];
const SEND_TIMEOUT_MS = 30_000;
const OPEN_TIMEOUT_MS = 5_000;

chrome.action.onClicked.addListener((tab) => {
	if (tab.id !== undefined) void toggle(tab.id);
});

async function toggle(tabId: number): Promise<void> {
	try {
		const [shown] = await chrome.scripting.executeScript({
			target: { tabId },
			// runs in the tab, serialized: it names PICKER_GLOBAL (messages.ts) as a literal
			func: () => {
				const picker = (globalThis as Record<string, unknown>).__spoolPicker as PickerHandle | undefined;
				picker?.toggle();
				return picker !== undefined;
			},
		});
		if (shown?.result !== true) await chrome.scripting.executeScript({ target: { tabId }, files: ["picker.js"] });
	} catch {
		// a page no extension may script (chrome://, the Web Store): nothing to pick on
	}
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
	const ask = message as Ask;
	if (ask.type === "spool:shot") {
		void chrome.tabs
			.captureVisibleTab(sender.tab?.windowId, { format: "png" })
			.catch(() => null)
			.then(respond);
		return true;
	}
	if (ask.type === "spool:send") {
		void send(JSON.stringify(ask.capture)).then(respond);
		return true;
	}
	if (ask.type === "spool:open") {
		void open(JSON.stringify(ask.open)).then(respond);
		return true;
	}
	return undefined;
});

async function ports(): Promise<number[]> {
	const { ports } = await chrome.storage.local.get("ports");
	const list = Array.isArray(ports) ? ports.filter((p): p is number => Number.isInteger(p) && p > 0 && p < 65536) : [];
	return list.length > 0 ? list : DEFAULT_PORTS;
}

/** the first port that answers at all, or null when none does */
async function post(path: string, body: string, timeout: number): Promise<Response | null> {
	for (const port of await ports()) {
		try {
			return await fetch(`http://127.0.0.1:${port}${path}`, {
				method: "POST",
				headers: { "content-type": "application/json" },
				body,
				signal: AbortSignal.timeout(timeout),
			});
		} catch {
			// nothing listening there, or it never answered: the next one
		}
	}
	return null;
}

async function send(body: string): Promise<SendAnswer> {
	const res = await post("/api/references", body, SEND_TIMEOUT_MS);
	if (res === null) return { ok: false, offline: true };
	if (!res.ok) return { ok: false, offline: false, error: await reason(res) };
	return { ok: true, sent: (await res.json()) as ReferenceSent };
}

async function open(body: string): Promise<OpenAnswer> {
	const res = await post("/api/references/open", body, OPEN_TIMEOUT_MS);
	if (res === null || !res.ok) return { ok: false };
	const opened = (await res.json()) as ReferenceOpened;
	// no spool window took it: the canvas in a tab of this browser instead
	if (!opened.shown) await chrome.tabs.create({ url: opened.url });
	return { ok: true, opened };
}

async function reason(res: Response): Promise<string> {
	try {
		const body = (await res.json()) as { error?: unknown };
		if (typeof body.error === "string") return body.error;
	} catch {
		// not JSON
	}
	return `${res.status} ${res.statusText}`.trim();
}
