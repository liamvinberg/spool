import { describe, expect, it } from "vitest";
import type { FlowEdge, ProjectedFrame } from "../api";
import {
	camerasFromState,
	framesOnPage,
	pageLabel,
	pageList,
	portalEdges,
	ROOT_PAGE,
	resolveActivePage,
	stateCameraSlots,
} from "./pages";

const frame = (name: string, page?: string): ProjectedFrame => ({
	name,
	...(page === undefined ? {} : { page }),
	x: 0,
	y: 0,
	w: 390,
	h: 844,
	hasThumb: false,
});

const edge = (from: string, to: string): FlowEdge => ({ from, to, certainty: "will", sites: [] });

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
	it("lists the permanent root page first", () => {
		expect(pageList(["admin", "shop"])).toEqual([ROOT_PAGE, "admin", "shop"]);
		expect(pageList([])).toEqual([ROOT_PAGE]);
	});

	it("names the root page for chrome and pages by their folder", () => {
		expect(pageLabel(ROOT_PAGE)).toBe("root");
		expect(pageLabel("shop")).toBe("shop");
	});
});

describe("per-page camera bookkeeping", () => {
	it("reads the root camera from the original slot and named pages from theirs", () => {
		const cameras = camerasFromState({
			mode: "live",
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
		expect(camerasFromState({ mode: "live", ...stateCameraSlots(cameras) })).toEqual(cameras);
	});
});

describe("portal jump resolution", () => {
	const frames = [frame("home"), frame("about"), frame("checkout", "shop"), frame("receipt", "shop")];

	it("marks only the edges that leave the active page", () => {
		const edges = [edge("home", "checkout"), edge("home", "about"), edge("checkout", "receipt")];
		expect(portalEdges(edges, frames, ROOT_PAGE)).toEqual([{ from: "home", to: "checkout", toPage: "shop" }]);
		expect(portalEdges(edges, frames, "shop")).toEqual([]);
	});

	it("marks a page frame's link back to the root page", () => {
		const edges = [edge("receipt", "home")];
		expect(portalEdges(edges, frames, "shop")).toEqual([{ from: "receipt", to: "home", toPage: ROOT_PAGE }]);
	});

	it("draws nothing for missing targets and self walks", () => {
		const edges = [edge("home", "ghost"), edge("home", "home")];
		expect(portalEdges(edges, frames, ROOT_PAGE)).toEqual([]);
	});
});
