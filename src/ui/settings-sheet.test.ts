// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SETTINGS, type SettingKey, type SettingReading, type SettingsSnapshot } from "../settings/registry";

/**
 * The sheet (#282), over a daemon played by a fetch stub: every registry entry
 * gets a row, a control writes its own key, and a refusal leaves the control on
 * the file's value with the reason under it.
 */

const snapshot = (values: Partial<Record<SettingKey, unknown>> = {}): SettingsSnapshot => ({
	project: "/tmp/demo",
	entries: (Object.keys(SETTINGS) as SettingKey[]).map((key) => {
		const entry = SETTINGS[key];
		const moved = key in values;
		return {
			key,
			value: moved ? values[key] : entry.fallback,
			fallback: entry.fallback,
			source: moved ? "file" : "default",
			scope: entry.scope,
			group: entry.group,
			shape: entry.shape,
			label: entry.label,
			says: entry.says,
		} as SettingReading;
	}),
});

async function mount(daemon: (init: RequestInit | undefined) => Response) {
	vi.resetModules();
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	Object.defineProperty(window, "__SPOOL_CONTROL__", { configurable: true, value: "control-test-token" });
	const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => daemon(init));
	vi.stubGlobal("fetch", fetchMock);
	const { SettingsSheet } = await import("./settings-sheet");
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const onClose = vi.fn();
	await act(async () => root.render(createElement(SettingsSheet, { project: "demo", onClose })));
	// the first read lands on the next tick
	await act(async () => {
		await Promise.resolve();
	});
	return {
		host,
		fetchMock,
		onClose,
		unmount: () => {
			act(() => root.unmount());
			host.remove();
		},
	};
}

const reads = (init: RequestInit | undefined) => init?.method === undefined || init.method === "GET";
const bodyOf = (init: RequestInit | undefined) => JSON.parse(String(init?.body)) as { key: string; value: unknown };

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	delete (window as Window & { __SPOOL_CONTROL__?: string }).__SPOOL_CONTROL__;
});

it("draws every general entry as a row from the registry, in bands named by file", async () => {
	const { host, unmount } = await mount(() => Response.json(snapshot()));
	const dialog = host.querySelector('[role="dialog"][aria-label="Settings"]');
	expect(dialog).not.toBeNull();
	const text = dialog?.textContent ?? "";
	for (const key of Object.keys(SETTINGS) as SettingKey[]) {
		const entry = SETTINGS[key];
		if (entry.group === "theme" || entry.group === "appearance") continue;
		expect(text).toContain(entry.label);
		expect(text).toContain(entry.says);
	}
	expect(text).toContain("design/canvas.json");
	expect(text).toContain("~/.spool/registry.json");
	expect(text).toContain("~/.spool/config.json");
	unmount();
});

it("writes the row's own key and shows the daemon's reading back", async () => {
	let history = false;
	const { host, fetchMock, unmount } = await mount((init) => {
		if (reads(init)) return Response.json(snapshot(history ? { history } : {}));
		const body = bodyOf(init);
		expect(body.key).toBe("history");
		history = body.value as boolean;
		return Response.json(snapshot({ history }).entries.find((entry) => entry.key === "history"));
	});
	const toggle = host.querySelector<HTMLButtonElement>('[role="switch"][aria-label="History"]');
	expect(toggle?.getAttribute("aria-checked")).toBe("false");
	await act(async () => toggle?.click());
	await act(async () => {
		await Promise.resolve();
	});
	expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "PUT")).toBe(true);
	expect(toggle?.getAttribute("aria-checked")).toBe("true");
	unmount();
});

it("keeps a refused write on the file's value and says why", async () => {
	const { host, unmount } = await mount((init) => {
		if (reads(init)) return Response.json(snapshot());
		return new Response("design/canvas.json is not a JSON object", { status: 409 });
	});
	const toggle = host.querySelector<HTMLButtonElement>('[role="switch"][aria-label="History"]');
	await act(async () => toggle?.click());
	await act(async () => {
		await Promise.resolve();
	});
	expect(toggle?.getAttribute("aria-checked")).toBe("false");
	expect(host.querySelector('[role="alert"]')?.textContent).toContain("not a JSON object");
	unmount();
});

it("puts the looks, the presets and every token of the shown look on Appearance, and resets as one unset", async () => {
	const writes: unknown[] = [];
	const { host, unmount } = await mount((init) => {
		if (reads(init)) return Response.json(snapshot({ "theme.dark.thread": "#2f6fe0" }));
		writes.push(JSON.parse(String(init?.body)));
		return Response.json([]);
	});
	const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
		(b) => b.textContent === "Appearance",
	);
	await act(async () => tab?.click());
	const text = host.querySelector('[role="dialog"]')?.textContent ?? "";
	for (const look of ["Dark", "Light", "System"]) expect(text).toContain(look);
	for (const preset of ["Catppuccin Mocha", "Nord", "Mono", "Custom"]) expect(text).toContain(preset);
	expect(text).not.toContain("Catppuccin Latte");
	expect(text).toContain("1 moved");
	const customize = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
		b.textContent?.startsWith("Customize"),
	);
	await act(async () => customize?.click());
	for (const key of Object.keys(SETTINGS) as SettingKey[]) {
		if (SETTINGS[key].group !== "theme") continue;
		const row = host.querySelector(`[data-token="${key}"]`);
		if (key.startsWith("theme.dark.")) expect(row, key).not.toBeNull();
		else expect(row, key).toBeNull();
	}
	const reset = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) =>
		b.textContent?.startsWith("Reset to spool"),
	);
	expect(reset?.disabled).toBe(false);
	await act(async () => reset?.click());
	await act(async () => {
		await Promise.resolve();
	});
	expect(writes).toMatchObject([{ writes: [{ key: "theme.dark.thread", value: null }] }]);
	unmount();
});

it("applies a preset as one write of ten tokens into its look", async () => {
	const writes: { writes: { key: string; value: unknown }[] }[] = [];
	const { host, unmount } = await mount((init) => {
		if (reads(init)) return Response.json(snapshot());
		writes.push(JSON.parse(String(init?.body)));
		return Response.json([]);
	});
	const tab = [...host.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(
		(b) => b.textContent === "Appearance",
	);
	await act(async () => tab?.click());
	const nord = [...host.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === "Nord");
	await act(async () => nord?.click());
	await act(async () => {
		await Promise.resolve();
	});
	expect(writes[0]?.writes).toHaveLength(10);
	expect(writes[0]?.writes.every((write) => write.key.startsWith("theme.dark."))).toBe(true);
	expect(writes[0]?.writes.find((write) => write.key === "theme.dark.thread")?.value).toBe("#88c0d0");
	unmount();
});

it("goes on esc", async () => {
	const { onClose, unmount } = await mount(() => Response.json(snapshot()));
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	});
	expect(onClose).toHaveBeenCalled();
	unmount();
});
