import type { Camera, CanvasState, FlowEdge, ProjectedFrame } from "../api";

/**
 * The pure page logic (#39): which page a frame belongs to, which page the
 * canvas shows, where each page's camera rests, and which links leave the
 * page. The root page is the frames directory itself, spelled "" here — it is
 * permanent, listed first, and keeps the original camera slot in the state
 * file so flat projects' state reads unchanged.
 */

export const ROOT_PAGE = "";

/** The page a projected frame sits on — the root page when unattributed. */
export function pageOf(frame: ProjectedFrame): string {
	return frame.page ?? ROOT_PAGE;
}

/** Sidebar order: the permanent root page first, named pages as discovered. */
export function pageList(pages: readonly string[]): string[] {
	return [ROOT_PAGE, ...pages];
}

/** The stored active page if it still exists; the root page otherwise. */
export function resolveActivePage(stored: string | undefined, pages: readonly string[]): string {
	return stored !== undefined && pages.includes(stored) ? stored : ROOT_PAGE;
}

export function framesOnPage(frames: readonly ProjectedFrame[], page: string): ProjectedFrame[] {
	return frames.filter((frame) => pageOf(frame) === page);
}

/** How a page reads in chrome: the root page has no folder to name it. */
export function pageLabel(page: string): string {
	return page === ROOT_PAGE ? "root" : page;
}

/** Every page's last known camera, keyed by page — the root page from the
 * original camera slot, named pages from theirs. */
export function camerasFromState(state: CanvasState): Record<string, Camera> {
	const cameras: Record<string, Camera> = {};
	if (state.camera !== undefined) cameras[ROOT_PAGE] = state.camera;
	for (const [page, camera] of Object.entries(state.pageCameras ?? {})) cameras[page] = camera;
	return cameras;
}

/** The camera map folded back into the state file's two slots. */
export function stateCameraSlots(cameras: Record<string, Camera>): Pick<CanvasState, "camera" | "pageCameras"> {
	const root = cameras[ROOT_PAGE];
	const named = Object.fromEntries(Object.entries(cameras).filter(([page]) => page !== ROOT_PAGE));
	return {
		...(root === undefined ? {} : { camera: root }),
		...(Object.keys(named).length === 0 ? {} : { pageCameras: named }),
	};
}

/** An edge that leaves the active page: drawn as a portal, never an arrow. */
export interface PortalMarker {
	from: string;
	to: string;
	/** The page the target lives on — where activating the portal jumps. */
	toPage: string;
}

/**
 * The links that exit the active page, one marker per from→to pair. A target
 * no frame answers draws nothing here either — portals mark real frames on
 * other pages, missing stays the map's business.
 */
export function portalEdges(
	edges: readonly FlowEdge[],
	frames: readonly ProjectedFrame[],
	activePage: string,
): PortalMarker[] {
	const pageByName = new Map(frames.map((frame) => [frame.name, pageOf(frame)]));
	const seen = new Set<string>();
	const out: PortalMarker[] = [];
	for (const edge of edges) {
		if (edge.from === edge.to) continue;
		const fromPage = pageByName.get(edge.from);
		const toPage = pageByName.get(edge.to);
		if (fromPage !== activePage || toPage === undefined || toPage === activePage) continue;
		const key = `${edge.from}\0${edge.to}`;
		if (seen.has(key)) continue;
		seen.add(key);
		out.push({ from: edge.from, to: edge.to, toPage });
	}
	return out.sort((a, b) => a.from.localeCompare(b.from) || a.to.localeCompare(b.to));
}
