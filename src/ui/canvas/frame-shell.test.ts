// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { coverPlan, FrameShell } from "./frame-shell";

vi.mock("../thumbnail", async () => {
	const { createElement } = await import("react");
	return {
		// stands in for the real fetch-then-object-URL image, carrying through
		// whatever the shell styles it with
		Thumbnail: ({ alt, style }: { alt: string; style?: Record<string, string> }) =>
			createElement("img", { alt, style, "data-terminal-cover": "image" }),
	};
});
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

/**
 * The cover law (#8, #28, #80): a boot is covered until its loaded report. The
 * veil + "booting" badge belongs to a boot somebody asked for — going inside,
 * or a frame with nothing to stand in for it. An ambient mount and a walk
 * arrival both hold their still instead, so a canvas filling itself in behind
 * you never turns into a run of badges.
 */

const plan = (over: Partial<Parameters<typeof coverPlan>[0]>) =>
	coverPlan({ state: "live", ready: false, hasThumb: true, entered: false, walk: null, ...over });

describe("coverPlan", () => {
	it("covers a hibernated frame with its thumbnail, no badge", () => {
		expect(plan({ state: "hibernated" })).toEqual({ cover: true, image: "thumb", badge: false });
	});

	it("badges the boot you asked for by going inside", () => {
		expect(plan({ entered: true })).toEqual({ cover: true, image: "thumb", badge: true });
	});

	it("leaves an ambient mount to fill itself in behind its own still", () => {
		expect(plan({})).toEqual({ cover: true, image: "thumb", badge: false });
	});

	it("badges any boot with nothing to show, asked for or not", () => {
		expect(plan({ hasThumb: false })).toEqual({ cover: true, image: "placeholder", badge: true });
	});

	it("holds the just-taken still for a walk boot, no veil, no badge", () => {
		expect(plan({ walk: { still: "data:," } })).toEqual({ cover: true, image: "still", badge: false });
	});

	it("falls back to the thumbnail when a walk arrival had no still to take", () => {
		// a hibernated target cannot answer a capture — its cached thumb is the still
		expect(plan({ walk: {} })).toEqual({ cover: true, image: "thumb", badge: false });
	});

	it("stays quiet even down to the placeholder on a walk boot", () => {
		expect(plan({ hasThumb: false, walk: {} })).toEqual({ cover: true, image: "placeholder", badge: false });
	});

	it("uncovers once the boot reports loaded, walk or not", () => {
		expect(plan({ ready: true }).cover).toBe(false);
		expect(plan({ ready: true, walk: { still: "data:," } }).cover).toBe(false);
	});

	it("never badges a frame that is not mounted", () => {
		expect(plan({ state: "hibernated", hasThumb: false })).toEqual({
			cover: true,
			image: "placeholder",
			badge: false,
		});
	});

	it("lets an unavailable terminal message override a cached image", () => {
		expect(
			plan({
				state: "hibernated",
				terminalCover: { kind: "never-run", message: "saving it does not create a screen" },
			}),
		).toEqual({
			cover: true,
			image: "terminal-message",
			badge: false,
			message: "saving it does not create a screen",
		});
	});
});

describe("FrameShell stills", () => {
	const mounted = {
		project: "demo",
		name: "hero",
		state: "live" as const,
		ready: true,
		entered: false,
		interactive: false,
		docNonce: 0,
		thumbNonce: 0,
		hasThumb: true,
		terminalCover: undefined,
		walkBoot: undefined,
		onIframe: vi.fn(),
	};

	it("swaps the document for its still without unmounting either", async () => {
		const host = document.createElement("div");
		const root = createRoot(host);
		await act(async () => {
			root.render(createElement(FrameShell, { ...mounted, stilled: false }));
		});
		const iframe = host.querySelector("iframe");
		const still = host.querySelector("img");
		expect(iframe?.style.visibility).toBe("visible");
		expect(still?.style.visibility).toBe("hidden");

		await act(async () => {
			root.render(createElement(FrameShell, { ...mounted, stilled: true }));
		});
		// the same elements, only their visibility exchanged: a still mounted at
		// the gesture would still be decoding, and the document would reload
		expect(host.querySelector("iframe")).toBe(iframe);
		expect(host.querySelector("img")).toBe(still);
		expect(iframe?.style.visibility).toBe("hidden");
		expect(still?.style.visibility).toBe("visible");

		act(() => root.unmount());
	});

	it("keeps the still out of the DOM for a frame that has none", async () => {
		const host = document.createElement("div");
		const root = createRoot(host);
		await act(async () => {
			root.render(createElement(FrameShell, { ...mounted, hasThumb: false, stilled: false }));
		});
		expect(host.querySelector("img")).toBeNull();
		act(() => root.unmount());
	});
});

describe("FrameShell terminal covers", () => {
	it("replaces a cached current image with the actionable stale message", async () => {
		const host = document.createElement("div");
		const root = createRoot(host);
		const props = {
			project: "demo",
			name: "dash",
			state: "hibernated" as const,
			ready: false,
			entered: false,
			stilled: false,
			interactive: false,
			docNonce: 0,
			thumbNonce: 0,
			hasThumb: true,
			walkBoot: undefined,
			onIframe: vi.fn(),
		};

		await act(async () => {
			root.render(createElement(FrameShell, { ...props, terminalCover: { kind: "current" } }));
		});
		expect(host.querySelector('[data-terminal-cover="image"]')).not.toBeNull();

		await act(async () => {
			root.render(
				createElement(FrameShell, {
					...props,
					terminalCover: {
						kind: "stale",
						message:
							'persisted screen for "dash" is stale after its source changed; terminal execution is disabled, so no current screen is available',
					},
				}),
			);
		});
		expect(host.querySelector('[data-terminal-cover="image"]')).toBeNull();
		expect(host.textContent).toContain("stale after its source changed");

		act(() => root.unmount());
	});

	it("covers an already-mounted terminal when its source becomes stale", async () => {
		const host = document.createElement("div");
		const root = createRoot(host);
		const props = {
			project: "demo",
			name: "dash",
			state: "warm" as const,
			ready: true,
			entered: false,
			stilled: false,
			interactive: false,
			docNonce: 0,
			thumbNonce: 0,
			hasThumb: true,
			walkBoot: undefined,
			onIframe: vi.fn(),
		};

		await act(async () => {
			root.render(createElement(FrameShell, { ...props, terminalCover: { kind: "current" } }));
		});
		const iframe = host.querySelector("iframe");
		expect(iframe).not.toBeNull();
		expect(host.textContent).not.toContain("stale");

		await act(async () => {
			root.render(
				createElement(FrameShell, {
					...props,
					terminalCover: {
						kind: "stale",
						message:
							'persisted screen for "dash" is stale after its source changed; terminal execution is disabled, so no current screen is available',
					},
				}),
			);
		});
		expect(host.querySelector("iframe")).toBe(iframe);
		expect(host.textContent).toContain("stale after its source changed");

		act(() => root.unmount());
	});
});
