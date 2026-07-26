// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { coverPlan, FrameShell } from "./frame-shell";

vi.mock("../thumbnail", async () => {
	const { createElement } = await import("react");
	return {
		Thumbnail: ({ alt }: { alt: string }) => createElement("img", { alt, "data-terminal-cover": "image" }),
	};
});
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

/**
 * The cover law (#8, #28): a boot is covered until its loaded report; a
 * standard boot wears the veil + "booting" badge, a walk arrival never does —
 * it holds the freshest still, uncovered, so the screen settles into life
 * instead of visibly reloading.
 */

describe("coverPlan", () => {
	it("covers a hibernated frame with its thumbnail, no badge", () => {
		expect(coverPlan({ state: "hibernated", ready: false, hasThumb: true, walk: null })).toEqual({
			cover: true,
			image: "thumb",
			badge: false,
		});
	});

	it("badges a standard boot over the stale thumbnail", () => {
		expect(coverPlan({ state: "live", ready: false, hasThumb: true, walk: null })).toEqual({
			cover: true,
			image: "thumb",
			badge: true,
		});
	});

	it("holds the just-taken still for a walk boot, no veil, no badge", () => {
		expect(coverPlan({ state: "live", ready: false, hasThumb: true, walk: { still: "data:," } })).toEqual({
			cover: true,
			image: "still",
			badge: false,
		});
	});

	it("falls back to the thumbnail when a walk arrival had no still to take", () => {
		// a hibernated target cannot answer a capture — its cached thumb is the still
		expect(coverPlan({ state: "live", ready: false, hasThumb: true, walk: {} })).toEqual({
			cover: true,
			image: "thumb",
			badge: false,
		});
	});

	it("stays quiet even down to the placeholder on a walk boot", () => {
		expect(coverPlan({ state: "live", ready: false, hasThumb: false, walk: {} })).toEqual({
			cover: true,
			image: "placeholder",
			badge: false,
		});
	});

	it("uncovers once the boot reports loaded, walk or not", () => {
		expect(coverPlan({ state: "live", ready: true, hasThumb: true, walk: null }).cover).toBe(false);
		expect(coverPlan({ state: "live", ready: true, hasThumb: true, walk: { still: "data:," } }).cover).toBe(false);
	});

	it("never badges a frame that is not mounted", () => {
		expect(coverPlan({ state: "hibernated", ready: false, hasThumb: false, walk: null })).toEqual({
			cover: true,
			image: "placeholder",
			badge: false,
		});
	});

	it("lets an unavailable terminal message override a cached image", () => {
		expect(
			coverPlan({
				state: "hibernated",
				ready: false,
				hasThumb: true,
				walk: null,
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

describe("FrameShell terminal covers", () => {
	it("replaces a cached current image with the actionable stale message", async () => {
		const host = document.createElement("div");
		const root = createRoot(host);
		const props = {
			project: "demo",
			name: "dash",
			state: "hibernated" as const,
			ready: false,
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
