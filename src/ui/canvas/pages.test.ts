import { describe, expect, it } from "vitest";
import { ROOT_PAGE } from "../../page-path";
import type { ProjectedFrame } from "../api";
import {
	camerasFromState,
	frameSourcePath,
	frameSourceRel,
	framesOnPage,
	pageLabel,
	pagePathLabel,
	resolveActivePage,
	stateCameraSlots,
	switchPage,
} from "./pages";

const frame = (name: string, page?: string): ProjectedFrame => ({
	name,
	...(page === undefined ? {} : { page }),
	x: 0,
	y: 0,
	w: 390,
	h: 844,
});

describe("page-switch state", () => {
	it("keeps a stored page that still exists and falls back to root otherwise", () => {
		expect(resolveActivePage("shop", ["admin", "shop"])).toBe("shop");
		expect(resolveActivePage("gone", ["shop"])).toBe(ROOT_PAGE);
		expect(resolveActivePage(undefined, ["shop"])).toBe(ROOT_PAGE);
		expect(resolveActivePage(undefined, [])).toBe(ROOT_PAGE);
	});

	it("scopes the field to the active page", () => {
		const frames = [frame("home"), frame("checkout", "shop"), frame("cart", "shop")];
		expect(framesOnPage(frames, ROOT_PAGE).map((f) => f.name)).toEqual(["home"]);
		expect(framesOnPage(frames, "shop").map((f) => f.name)).toEqual(["checkout", "cart"]);
	});
});

describe("sidebar list derivation", () => {
	it("names the root page for chrome and pages by their folder", () => {
		expect(pageLabel(ROOT_PAGE)).toBe("root");
		expect(pageLabel("shop")).toBe("shop");
		// a row sits in a tree that already says where it is, so it says its own name
		expect(pageLabel("explorations/chat")).toBe("chat");
	});

	it("says the whole of where a page is where there is no tree to say it", () => {
		expect(pagePathLabel(ROOT_PAGE)).toBe("root");
		expect(pagePathLabel("shop")).toBe("shop");
		expect(pagePathLabel("explorations/chat")).toBe("explorations/chat");
	});

	it("builds a frame's source path through its page, at whatever depth it sits", () => {
		expect(frameSourceRel("home", ROOT_PAGE)).toBe("frames/home/frame.tsx");
		expect(frameSourceRel("checkout", "shop")).toBe("frames/shop/checkout/frame.tsx");
		expect(frameSourcePath("checkout", "shop")).toBe("design/frames/shop/checkout/frame.tsx");
		expect(frameSourceRel("agent-chat", "explorations/chat")).toBe("frames/explorations/chat/agent-chat/frame.tsx");
	});
});

describe("page switching", () => {
	const rootCamera = { x: 1, y: 2, k: 1 };
	const shopCamera = { x: 3, y: 4, k: 2 };

	it("saves the leaving page's camera and restores the arriving page's", () => {
		const next = switchPage({ shop: shopCamera }, ROOT_PAGE, rootCamera, "shop");
		expect(next.cameras).toEqual({ [ROOT_PAGE]: rootCamera, shop: shopCamera });
		expect(next.camera).toEqual(shopCamera);
	});

	it("arrives at null when the page has no stored camera — the field fits", () => {
		const next = switchPage({}, ROOT_PAGE, rootCamera, "shop");
		expect(next.camera).toBeNull();
	});

	it("lets a caller's arrival camera win over the stored one", () => {
		const arriveAt = { x: 9, y: 9, k: 1 };
		const next = switchPage({ shop: shopCamera }, ROOT_PAGE, rootCamera, "shop", arriveAt);
		expect(next.camera).toEqual(arriveAt);
	});

	it("keeps the map untouched when the leaving page never had a camera", () => {
		const next = switchPage({ shop: shopCamera }, ROOT_PAGE, null, "shop");
		expect(next.cameras).toEqual({ shop: shopCamera });
	});
});

describe("per-page camera bookkeeping", () => {
	it("reads the root camera from the original slot and named pages from theirs", () => {
		const cameras = camerasFromState({
			camera: { x: 1, y: 2, k: 1 },
			pageCameras: { shop: { x: 3, y: 4, k: 2 } },
		});
		expect(cameras).toEqual({ [ROOT_PAGE]: { x: 1, y: 2, k: 1 }, shop: { x: 3, y: 4, k: 2 } });
	});

	it("folds the camera map back into the state slots, omitting empty ones", () => {
		expect(stateCameraSlots({})).toEqual({});
		expect(stateCameraSlots({ [ROOT_PAGE]: { x: 1, y: 2, k: 1 } })).toEqual({ camera: { x: 1, y: 2, k: 1 } });
		expect(stateCameraSlots({ shop: { x: 3, y: 4, k: 2 } })).toEqual({ pageCameras: { shop: { x: 3, y: 4, k: 2 } } });
	});

	it("survives the round trip unchanged", () => {
		const cameras = { [ROOT_PAGE]: { x: 1, y: 2, k: 1 }, shop: { x: 3, y: 4, k: 2 } };
		expect(camerasFromState(stateCameraSlots(cameras))).toEqual(cameras);
	});
});
