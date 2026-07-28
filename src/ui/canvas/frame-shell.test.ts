// @vitest-environment happy-dom

import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { describe, expect, it, vi } from "vitest";
import { coverPlan, FrameShell } from "./frame-shell";
import type { FrameState } from "./lifecycle";

vi.mock("../thumbnail", async () => {
	const { createElement } = await import("react");
	return {
		Thumbnail: ({ alt, style }: { alt: string; style?: Record<string, string> }) =>
			createElement("img", { alt, style, "data-terminal-cover": "image" }),
	};
});

const COVER = { hash: "d".repeat(32) };
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

/**
 * The cover law (#8, #28, #112): the still covers every non-live frame, and a
 * live frame until its loaded report. The veil +
 * "booting" badge belongs to that boot alone. A frame borrowed to be
 * photographed boots out of sight behind its own still, and a walk arrival is
 * quiet the same way, so a canvas filling itself in behind you never turns into
 * a run of badges.
 */

const plan = (over: Partial<Parameters<typeof coverPlan>[0]>) =>
	coverPlan({ state: "live", ready: false, entered: true, covered: true, walk: false, ...over });

describe("coverPlan", () => {
	it("covers a frame standing as its picture, no badge", () => {
		expect(plan({ state: "picture", entered: false })).toEqual({ cover: true, image: "cover", badge: false });
	});

	it("badges the boot you asked for by going inside", () => {
		expect(plan({})).toEqual({ cover: true, image: "cover", badge: true });
	});

	it("leaves a borrowed frame to boot behind its own still, badgeless", () => {
		const borrowed = { state: "refreshing", entered: false } as const;
		expect(plan(borrowed)).toEqual({ cover: true, image: "cover", badge: false });
		expect(plan({ ...borrowed, ready: true })).toEqual({ cover: true, image: "cover", badge: false });
	});

	it("keeps a held frame behind its still: real DOM to read, a picture to look at", () => {
		expect(plan({ state: "held", entered: false, ready: true })).toEqual({
			cover: true,
			image: "cover",
			badge: false,
		});
	});

	it("leaves a readable canvas frame uncovered while Select owns the pointer", () => {
		expect(plan({ state: "live", entered: false, ready: true }).cover).toBe(false);
	});

	it("shows the placeholder for a frame with nothing to stand in for it", () => {
		expect(plan({ state: "picture", entered: false, covered: false })).toEqual({
			cover: true,
			image: "placeholder",
			badge: false,
		});
	});

	it("covers a walk arrival with the target's stored still, no veil, no badge", () => {
		// #110: the stored still is a picture of a freshly booted frame, which is
		// where the walk lands — a capture taken just before the reboot would hold
		// up the one state the arrival is not in. Every arrival is entered the
		// moment it lands, and the badge belongs to a boot asked for by going
		// inside; a walk is not one.
		expect(plan({ walk: true })).toEqual({ cover: true, image: "cover", badge: false });
	});

	it("stays quiet even down to the placeholder on a walk boot", () => {
		expect(plan({ covered: false, walk: true })).toEqual({ cover: true, image: "placeholder", badge: false });
	});

	it("uncovers the frame you went inside once its boot reports loaded, walk or not", () => {
		expect(plan({ ready: true }).cover).toBe(false);
		expect(plan({ ready: true, walk: true }).cover).toBe(false);
	});

	it("never uncovers a frame you are not inside, however booted", () => {
		for (const state of ["refreshing", "held", "picture"] as const) {
			expect(plan({ state, entered: false, ready: true }).cover).toBe(true);
		}
	});

	it("lets an unavailable terminal message override a cached image", () => {
		expect(
			plan({
				state: "picture",
				entered: false,
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

describe("FrameShell documents", () => {
	const props: Omit<Parameters<typeof FrameShell>[0], "state"> = {
		project: "demo",
		name: "hero",
		ready: true,
		entered: false,
		interactive: false,
		terminal: false,
		docNonce: 0,
		cover: COVER,
		terminalCover: undefined,
		walkArrival: false,
		onIframe: vi.fn(),
	};

	const render = async (over: Partial<typeof props> & { state: FrameState }) => {
		const host = document.createElement("div");
		// attached, because an iframe outside the document has no contentWindow
		document.body.append(host);
		const root = createRoot(host);
		await act(async () => {
			root.render(createElement(FrameShell, { ...props, ...over }));
		});
		return {
			host,
			root: {
				unmount: () => {
					root.unmount();
					host.remove();
				},
			},
			again: async (next: Partial<typeof props> & { state: FrameState }) => {
				await act(async () => {
					root.render(createElement(FrameShell, { ...props, ...next }));
				});
			},
		};
	};

	it("keeps no document at all for a frame standing as its picture", async () => {
		const { host, root } = await render({ state: "picture" });
		expect(host.querySelector("iframe")).toBeNull();
		act(() => root.unmount());
	});

	it("shows every live document, whether it is entered or selected", async () => {
		const { host, root, again } = await render({ state: "live", entered: false });
		const wrapper = host.querySelector("iframe")?.parentElement;
		expect(wrapper?.style.visibility).toBe("visible");

		await again({ state: "live", entered: true });
		expect(wrapper?.style.visibility).toBe("visible");

		// Borrowed and unreadable held frames both stay behind their still.
		for (const state of ["refreshing", "held"] as const) {
			await again({ state });
			expect(host.querySelector("iframe")?.parentElement?.style.visibility).toBe("hidden");
		}
		act(() => root.unmount());
	});

	it("keeps a held html document mounted without an engine lock", async () => {
		const { host, root, again } = await render({ state: "held", ready: false });
		expect(host.querySelector("iframe")?.parentElement?.style.contentVisibility).toBe("");

		await again({ state: "held", ready: true });
		expect(host.querySelector("iframe")?.parentElement?.style.contentVisibility).toBe("");
		act(() => root.unmount());
	});

	it("shows the readable selected HTML frame while Select owns its pointer", async () => {
		const { host, root } = await render({ state: "live", entered: false, ready: true, interactive: false });
		const wrapper = host.querySelector("iframe")?.parentElement;
		expect(wrapper?.style.visibility).toBe("visible");
		expect(host.querySelector("iframe")?.style.pointerEvents).toBe("none");
		expect(host.querySelector("[data-frame-cover]")).toBeNull();
		act(() => root.unmount());
	});

	it("keeps the same document across every state that has one", async () => {
		// React reconciling an iframe whose src changed reloads it, and a frame
		// that reboots while Select owns it is a frame you cannot pick at.
		const { host, root, again } = await render({ state: "live" });
		const iframe = host.querySelector("iframe");
		await again({ state: "held" });
		await again({ state: "refreshing" });
		expect(host.querySelector("iframe")).toBe(iframe);
		act(() => root.unmount());
	});

	it("decodes the still while you are inside, for the instant you leave", async () => {
		const { host, root } = await render({ state: "live" });
		const still = host.querySelector("img");
		expect(still?.style.visibility).toBe("hidden");
		act(() => root.unmount());
	});

	it("keeps the still out of the DOM for a frame that has none", async () => {
		const { host, root } = await render({ state: "live", cover: undefined });
		expect(host.querySelector("img")).toBeNull();
		act(() => root.unmount());
	});

	it("asks a terminal for the freeze no CSS can reach, and never asks an html frame", async () => {
		const { host, root, again } = await render({ state: "live", terminal: true });
		const post = vi.fn();
		const window = host.querySelector("iframe")?.contentWindow;
		if (window === null || window === undefined) throw new Error("no frame window");
		window.postMessage = post;

		await again({ state: "held", terminal: true });
		expect(post).toHaveBeenCalledWith({ spool: "freeze", on: true }, "*");
		act(() => root.unmount());

		const html = await render({ state: "live" });
		const htmlPost = vi.fn();
		const htmlWindow = html.host.querySelector("iframe")?.contentWindow;
		if (htmlWindow === null || htmlWindow === undefined) throw new Error("no frame window");
		htmlWindow.postMessage = htmlPost;
		await html.again({ state: "held" });
		expect(htmlPost).not.toHaveBeenCalled();
		act(() => html.root.unmount());
	});
});

describe("FrameShell terminal covers", () => {
	it("replaces a cached current image with the actionable stale message", async () => {
		const host = document.createElement("div");
		const root = createRoot(host);
		const props = {
			project: "demo",
			name: "dash",
			state: "picture" as const,
			ready: false,
			entered: false,
			interactive: false,
			terminal: true,
			docNonce: 0,
			cover: COVER,
			walkArrival: false,
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
			state: "held" as const,
			ready: true,
			entered: false,
			interactive: false,
			terminal: true,
			docNonce: 0,
			cover: COVER,
			walkArrival: false,
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
