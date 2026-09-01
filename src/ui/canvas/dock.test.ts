// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { beforeEach, expect, it, onTestFinished } from "vitest";
import { Dock } from "./dock";

/**
 * The column's index, on its own.
 *
 * What the surfaces are is not this file's business — `canvas-properties-rail.test.ts`
 * walks the real ones over a real canvas. This is the dock's own three claims: how many
 * glyphs there are to press, what pressing one does to the panel, and what a shut surface
 * says when a turn lands in it.
 */

beforeEach(() => {
	window.localStorage?.clear();
});

const glyph = (host: HTMLElement, name: string) => host.querySelector<HTMLElement>(`[data-dock-glyph="${name}"]`);
const panel = (host: HTMLElement) => host.querySelector<HTMLElement>("[data-dock-panel]");
const strip = (host: HTMLElement) => host.querySelector("[data-dock-strip]");

it("draws no index for one surface, and one the moment the column is shut", async () => {
	const { host } = mount({ agentOn: false });

	// one surface is not a list: the strip is that surface's own shut state, which
	// is the column spool shipped before the agent was ever a surface here
	expect(strip(host)).toBeNull();
	expect(glyph(host, "agent")).toBeNull();
	expect(panel(host)?.style.width).toBe("300px");

	await press(host.querySelector<HTMLElement>('[data-rail="properties"] button'));
	expect(panel(host)?.style.width).toBe("0px");
	expect(strip(host)).not.toBeNull();
});

it("swaps the panel between two surfaces, each at its own width", async () => {
	const { host } = mount({ agentOn: true });

	expect(strip(host)).not.toBeNull();
	expect(panel(host)?.style.width).toBe("300px");
	expect(glyph(host, "properties")?.getAttribute("aria-pressed")).toBe("true");

	await press(glyph(host, "agent"));
	expect(panel(host)?.style.width).toBe("420px");
	expect(glyph(host, "agent")?.getAttribute("aria-pressed")).toBe("true");
	expect(glyph(host, "properties")?.getAttribute("aria-pressed")).toBe("false");

	// the lit glyph is the shut, and the index stays exactly where it was
	await press(glyph(host, "agent"));
	expect(panel(host)?.style.width).toBe("0px");
	expect(strip(host)).not.toBeNull();
});

it("marks the shut agent while a turn runs, and again once it has landed unread", async () => {
	const { host, render } = mount({ agentOn: true });

	await render({ agentOn: true, agentWorking: true });
	expect(glyph(host, "agent")?.querySelector("svg[class*=agent-spin]")).not.toBeNull();

	// it landed in a surface nobody was looking at, so the glyph keeps the fact
	await render({ agentOn: true, agentWorking: false });
	expect(glyph(host, "agent")?.querySelector("span[class*=unseen-in]")).not.toBeNull();

	// opening it is the only thing that answers the dot
	await press(glyph(host, "agent"));
	expect(glyph(host, "agent")?.querySelector("span[class*=unseen-in]")).toBeNull();
});

it("says nothing about a turn the agent surface was open for", async () => {
	const { host, render } = mount({ agentOn: true });
	await press(glyph(host, "agent"));

	await render({ agentOn: true, agentWorking: true });
	await render({ agentOn: true, agentWorking: false });

	await press(glyph(host, "agent"));
	expect(glyph(host, "agent")?.querySelector("span[class*=unseen-in]")).toBeNull();
});

/** the two surfaces, as anything that is not the dock: a width and the one act */
function surface(name: string) {
	return (width: number, shut: () => void) =>
		createElement(
			"div",
			{ "data-rail": name, style: { width } },
			createElement("button", { type: "button", onClick: shut }, "collapse"),
		);
}

function mount(props: { agentOn: boolean; agentWorking?: boolean }): {
	host: HTMLDivElement;
	render: (next: { agentOn: boolean; agentWorking?: boolean }) => Promise<void>;
} {
	const host = document.createElement("div");
	document.body.append(host);
	const root = createRoot(host);
	onTestFinished(() => {
		act(() => root.unmount());
		host.remove();
	});
	const render = async (next: { agentOn: boolean; agentWorking?: boolean }) => {
		await act(async () => {
			root.render(
				createElement(Dock, {
					agentOn: next.agentOn,
					agentWorking: next.agentWorking ?? false,
					properties: surface("properties"),
					agent: surface("agent"),
				}),
			);
		});
	};
	act(() => {
		root.render(
			createElement(Dock, {
				agentOn: props.agentOn,
				agentWorking: props.agentWorking ?? false,
				properties: surface("properties"),
				agent: surface("agent"),
			}),
		);
	});
	return { host, render };
}

async function press(element: HTMLElement | null): Promise<void> {
	if (element === null) throw new Error("nothing to press");
	await act(async () => {
		element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
	});
}
