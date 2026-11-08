// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, onTestFinished, vi } from "vitest";
import type { ProjectedFrame } from "../api";
import { FindPalette, type PaletteCommand } from "./find-palette";

const frame = (name: string, page: string, born: number): ProjectedFrame => ({
	name,
	page,
	x: 0,
	y: 0,
	w: 320,
	h: 200,
	born,
});

describe("FindPalette", () => {
	it("opens on every frame with its still, newest first, with the order named", () => {
		const markup = renderToStaticMarkup(
			createElement(FindPalette, {
				open: true,
				project: "shop",
				frames: [
					{ ...frame("spool-home", "app", Date.now() - 3 * 86_400_000), cover: { hash: "a".repeat(32) } },
					frame("agent-play--ask-drop", "agent", Date.now()),
				],
				onPick: () => {},
				onLand: () => {},
				onClose: () => {},
			}),
		);

		expect(markup).toContain("2 frames, newest first");
		expect(markup.indexOf("agent-play--ask-drop")).toBeLessThan(markup.indexOf("spool-home"));
		expect(markup).toContain("3d");
		expect(markup).toContain(`/covers/shop/spool-home/${"a".repeat(32)}`);
		expect(markup).toContain("↵ goes there");
		expect(markup).toContain("esc closes");
	});

	it("says so when nothing answers", () => {
		const markup = renderToStaticMarkup(
			createElement(FindPalette, {
				open: true,
				project: "shop",
				frames: [],
				onPick: () => {},
				onLand: () => {},
				onClose: () => {},
			}),
		);

		expect(markup).toContain("nothing answers to that");
		expect(markup).toContain("0 frames, newest first");
	});

	it("answers by what a frame says, read as it opens, and starts empty at each opening", async () => {
		const loadWords = vi.fn(async () => new Map([["season-pass", ["Renew for 2027"]]]));
		const { host, render } = await mount({ frames: [frame("season-pass", "travel", Date.now())], loadWords });
		await type(host, "renew");
		expect(host.textContent).toContain("says“Renew for 2027”");

		await render({ open: false });
		await render({ open: true });
		expect(input(host).value).toBe("");
		expect(loadWords).toHaveBeenCalledTimes(2);
	});
});

describe("FindPalette's commands", () => {
	const commands = (run: () => void): PaletteCommand[] => [
		{ id: "show-agent", label: "Show Agent", keys: "⌘⇧K", run },
		{ id: "reset", label: "Reset layout", run: () => {} },
		{ id: "split", label: "Split Agent below Pages", refused: "no room", run },
	];

	it("keeps an empty query to frames, and answers a typed one with the commands it matches too", async () => {
		const { host } = await mount({ commands: commands(() => {}) });
		expect(host.textContent).not.toContain("Reset layout");

		await type(host, "reset");
		expect(host.textContent).toContain("Reset layout");
		expect(host.textContent).not.toContain("Show Agent");
	});

	it("runs the picked command on enter and closes", async () => {
		const run = vi.fn();
		const onClose = vi.fn();
		const { host } = await mount({ commands: commands(run), onClose });
		await type(host, "show agent");
		await act(async () => {
			input(host).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(run).toHaveBeenCalledTimes(1);
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("says why a refused command cannot run, and does not run it", async () => {
		const run = vi.fn();
		const { host } = await mount({ commands: commands(run) });
		await type(host, "split agent");
		expect(host.textContent).toContain("no room");
		await act(async () => {
			input(host).dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
		});
		expect(run).not.toHaveBeenCalled();
	});
});

function input(host: HTMLElement): HTMLInputElement {
	const found = host.querySelector<HTMLInputElement>("input");
	if (found === null) throw new Error("no input");
	return found;
}

async function type(host: HTMLElement, value: string) {
	await act(async () => {
		Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input(host), value);
		input(host).dispatchEvent(new Event("input", { bubbles: true }));
	});
}

type Props = Parameters<typeof FindPalette>[0];

async function mount(props: Partial<Props>) {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	let now: Props = {
		open: true,
		project: "shop",
		frames: [frame("spool-home", "app", Date.now())],
		loadWords: async () => new Map(),
		onPick: () => {},
		onLand: () => {},
		onClose: () => {},
		...props,
	};
	const render = async (change: Partial<Props> = {}) => {
		now = { ...now, ...change };
		await act(async () => {
			root.render(createElement(FindPalette, now));
		});
	};
	await render();
	return { host, render };
}
