// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { SETTINGS, type SettingKey, type SettingReading, type SettingsSnapshot } from "../../settings/registry";
import type { TabProject } from "../tab-strip";

/**
 * The settings page (#282), over a daemon played by a fetch stub: every
 * registry entry gets a line in its section, a control writes its own key, and
 * a refusal leaves the control on the file's value with the reason under it.
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

const DEMO: TabProject = { root: "/tmp/demo", name: "demo" };

async function mount(
	daemon: (init: RequestInit | undefined) => Response,
	options: { project: TabProject | undefined } = { project: DEMO },
) {
	vi.resetModules();
	vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
	Object.defineProperty(window, "__SPOOL_CONTROL__", { configurable: true, value: "control-test-token" });
	const fetchMock = vi.fn(async (_url: unknown, init?: RequestInit) => daemon(init));
	vi.stubGlobal("fetch", fetchMock);
	const { SettingsPage } = await import("./page");
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	const onClose = vi.fn();
	await act(async () => root.render(createElement(SettingsPage, { ...options, onClose })));
	// the first read lands on the next tick
	await act(async () => {
		await Promise.resolve();
	});
	const page = () => host.querySelector('section[aria-label="Settings"]');
	const go = async (section: string) => {
		await act(async () => host.querySelector<HTMLButtonElement>(`[data-section="${section}"]`)?.click());
	};
	const settle = async () => {
		await act(async () => {
			await Promise.resolve();
		});
	};
	return {
		host,
		page,
		go,
		settle,
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
const sectionsOf = (host: HTMLElement) =>
	[...host.querySelectorAll<HTMLElement>('nav[aria-label="Settings sections"] [data-section]')].map(
		(item) => item.dataset.section,
	);
const button = (host: HTMLElement, text: string) =>
	[...host.querySelectorAll<HTMLButtonElement>("button")].find((candidate) => candidate.textContent === text);

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
	delete (window as Window & { __SPOOL_CONTROL__?: string }).__SPOOL_CONTROL__;
});

it("lists the project, This Mac, Appearance and Colours from a project, and opens on This Mac", async () => {
	const { host, page, unmount } = await mount(() => Response.json(snapshot()));
	expect(page()).not.toBeNull();
	expect(sectionsOf(host)).toEqual(["project", "machine", "appearance", "colours"]);
	const project = host.querySelector('[data-section="project"]');
	expect(project?.querySelector('[data-project-icon="letter"]')).not.toBeNull();
	expect(project?.textContent?.endsWith("demo")).toBe(true);
	expect(host.querySelector('[aria-current="page"]')?.getAttribute("data-section")).toBe("machine");
	expect(host.querySelector('button[aria-label="Back to demo"]')?.textContent).toContain("esc");
	unmount();
});

it("has no project section from Home, and goes back to Home", async () => {
	const { host, unmount } = await mount(() => Response.json({ ...snapshot(), project: null }), { project: undefined });
	expect(sectionsOf(host)).toEqual(["machine", "appearance", "colours"]);
	expect(host.querySelector('button[aria-label="Back to Home"]')).not.toBeNull();
	unmount();
});

it("draws every general entry as a line in the section of its file, naming the file once", async () => {
	const { page, go, unmount } = await mount(() => Response.json(snapshot()));
	const seen: Record<string, string> = {};
	for (const section of ["project", "machine"]) {
		await go(section);
		seen[section] = page()?.textContent ?? "";
	}
	for (const key of Object.keys(SETTINGS) as SettingKey[]) {
		const entry = SETTINGS[key];
		if (entry.group !== "general") continue;
		const text = seen[entry.scope] ?? "";
		expect(text).toContain(entry.label);
		expect(text).toContain(entry.says.replaceAll("`", ""));
	}
	expect(seen.project?.split("design/canvas.json")).toHaveLength(2);
	expect(seen.machine?.split("~/.spool/config.json")).toHaveLength(2);
	expect(seen.project).not.toContain("Agent permissions");
	unmount();
});

it("writes the line's own key and shows the daemon's reading back", async () => {
	let history = false;
	const { host, go, settle, fetchMock, unmount } = await mount((init) => {
		if (reads(init)) return Response.json(snapshot(history ? { history } : {}));
		const body = bodyOf(init);
		expect(body.key).toBe("history");
		history = body.value as boolean;
		return Response.json(snapshot({ history }).entries.find((entry) => entry.key === "history"));
	});
	await go("project");
	const toggle = host.querySelector<HTMLInputElement>('[role="switch"][aria-label="History"]');
	expect(toggle?.getAttribute("aria-checked")).toBe("false");
	await act(async () => toggle?.click());
	await settle();
	expect(fetchMock.mock.calls.some(([, init]) => (init as RequestInit)?.method === "PUT")).toBe(true);
	expect(toggle?.getAttribute("aria-checked")).toBe("true");
	unmount();
});

it("shows only machine settings without a project and keeps Appearance available", async () => {
	const writes: unknown[] = [];
	const { host, page, go, fetchMock, unmount } = await mount(
		(init) => {
			if (reads(init)) return Response.json({ ...snapshot(), project: null });
			writes.push(JSON.parse(String(init?.body)));
			return Response.json({});
		},
		{ project: undefined },
	);
	const text = page()?.textContent ?? "";
	expect(text).toContain("Default project location");
	expect(text).toContain("Check for updates");
	expect(text).not.toContain("History");
	expect(text).not.toContain("Agent permissions");
	expect(fetchMock.mock.calls.every(([url]) => !String(url).includes("project="))).toBe(true);
	await act(async () =>
		host.querySelector<HTMLInputElement>('[role="switch"][aria-label="Check for updates"]')?.click(),
	);
	expect(writes).toEqual([{ key: "updateCheck", value: false }]);
	await go("appearance");
	expect(page()?.textContent).toContain("Catppuccin Mocha");
	expect(page()?.textContent).toContain("Nord");
	unmount();
});

it("draws the threads as a switch on This Mac and writes its own key", async () => {
	const writes: unknown[] = [];
	const { host, page, unmount } = await mount((init) => {
		if (reads(init)) return Response.json(snapshot());
		writes.push(bodyOf(init));
		return Response.json(
			snapshot({ "canvas.threads": false }).entries.find((entry) => entry.key === "canvas.threads"),
		);
	});
	expect(page()?.textContent).toContain("~/.spool/config.json");
	const toggle = host.querySelector<HTMLInputElement>('[role="switch"][aria-label="Show threads"]');
	expect(toggle?.getAttribute("aria-checked")).toBe("true");
	await act(async () => toggle?.click());
	expect(writes).toMatchObject([{ key: "canvas.threads", value: false }]);
	unmount();
});

it("keeps a refused write on the file's value and says why", async () => {
	const { host, go, settle, unmount } = await mount((init) => {
		if (reads(init)) return Response.json(snapshot());
		return new Response("design/canvas.json is not a JSON object", { status: 409 });
	});
	await go("project");
	const toggle = host.querySelector<HTMLInputElement>('[role="switch"][aria-label="History"]');
	await act(async () => toggle?.click());
	await settle();
	expect(toggle?.getAttribute("aria-checked")).toBe("false");
	expect(host.querySelector('[role="alert"]')?.textContent).toContain("not a JSON object");
	unmount();
});

it("puts the looks and the presets of the shown look on Appearance", async () => {
	const { page, go, unmount } = await mount(() => Response.json(snapshot({ "theme.dark.thread": "#2f6fe0" })));
	await go("appearance");
	const text = page()?.textContent ?? "";
	for (const look of ["dark", "light", "system"]) expect(text).toContain(look);
	for (const preset of ["Catppuccin Mocha", "Nord", "Mono", "Custom"]) expect(text).toContain(preset);
	expect(text).not.toContain("Catppuccin Latte");
	expect(page()?.querySelector('button[aria-label="blue"]')?.getAttribute("aria-pressed")).toBe("true");
	unmount();
});

it("puts every token of the shown look on Colours, and resets as one unset", async () => {
	const writes: unknown[] = [];
	const { host, page, go, settle, unmount } = await mount((init) => {
		if (reads(init)) return Response.json(snapshot({ "theme.dark.thread": "#2f6fe0" }));
		writes.push(JSON.parse(String(init?.body)));
		return Response.json([]);
	});
	await go("colours");
	expect(page()?.textContent).toContain("1 moved");
	for (const key of Object.keys(SETTINGS) as SettingKey[]) {
		if (SETTINGS[key].group !== "theme") continue;
		const row = host.querySelector(`[data-token="${key}"]`);
		if (key.startsWith("theme.dark.")) expect(row, key).not.toBeNull();
		else expect(row, key).toBeNull();
	}
	const reset = button(host, "Reset to spool’s");
	expect(reset?.disabled).toBe(false);
	await act(async () => reset?.click());
	await settle();
	expect(writes).toMatchObject([{ writes: [{ key: "theme.dark.thread", value: null }] }]);
	unmount();
});

it("applies a preset as one write of ten tokens into its look", async () => {
	const writes: { writes: { key: string; value: unknown }[] }[] = [];
	const { host, go, settle, unmount } = await mount((init) => {
		if (reads(init)) return Response.json(snapshot());
		writes.push(JSON.parse(String(init?.body)));
		return Response.json([]);
	});
	await go("appearance");
	await act(async () => button(host, "Nord")?.click());
	await settle();
	expect(writes[0]?.writes).toHaveLength(10);
	expect(writes[0]?.writes.every((write) => write.key.startsWith("theme.dark."))).toBe(true);
	expect(writes[0]?.writes.find((write) => write.key === "theme.dark.thread")?.value).toBe("#88c0d0");
	unmount();
});

it("moves between sections and marks the one shown", async () => {
	const { host, page, go, unmount } = await mount(() => Response.json(snapshot()));
	await go("colours");
	expect(host.querySelector('[aria-current="page"]')?.getAttribute("data-section")).toBe("colours");
	expect(page()?.querySelector("h1")?.textContent).toBe("Colours");
	await go("project");
	expect(page()?.querySelector("h1")?.textContent).toBe("demo");
	unmount();
});

it("goes on esc, on ⌘, and on Back", async () => {
	const { host, onClose, unmount } = await mount(() => Response.json(snapshot()));
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	});
	expect(onClose).toHaveBeenCalledTimes(1);
	await act(async () => {
		window.dispatchEvent(new KeyboardEvent("keydown", { key: ",", metaKey: true, bubbles: true }));
	});
	expect(onClose).toHaveBeenCalledTimes(2);
	await act(async () => host.querySelector<HTMLButtonElement>('button[aria-label="Back to demo"]')?.click());
	expect(onClose).toHaveBeenCalledTimes(3);
	unmount();
});

it("goes on esc from a switch it just flipped, which takes no text", async () => {
	const { host, onClose, unmount } = await mount(() => Response.json(snapshot()));
	const toggle = host.querySelector<HTMLInputElement>('[role="switch"][aria-label="Check for updates"]');
	await act(async () => {
		toggle?.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
	});
	expect(onClose).toHaveBeenCalledTimes(1);
	unmount();
});

it("gives the focus back to where it was when it goes", async () => {
	const before = document.createElement("button");
	document.body.append(before);
	before.focus();
	const { unmount } = await mount(() => Response.json(snapshot()));
	before.blur();
	unmount();
	expect(document.activeElement).toBe(before);
	before.remove();
});
