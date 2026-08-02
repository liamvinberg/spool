import { pageName, ROOT_PAGE } from "../../page-path";
import type { Camera, CanvasState, ProjectedFrame } from "../api";

/**
 * The pure page logic (#39, #231): which page a frame belongs to, which page
 * the canvas shows, and where each page's camera rests. A page is its path
 * under frames/, and the root page is the frames directory itself, spelled ""
 * — it is permanent, it has no row of its own in the rail, and it keeps the
 * original camera slot in the state file so flat projects' state reads
 * unchanged.
 */

/** The page a projected frame sits on — the root page when unattributed. */
export function pageOf(frame: ProjectedFrame): string {
	return frame.page ?? ROOT_PAGE;
}

/** The stored active page if it still exists; the root page otherwise. */
export function resolveActivePage(stored: string | undefined, pages: readonly string[]): string {
	return stored !== undefined && pages.includes(stored) ? stored : ROOT_PAGE;
}

export function framesOnPage(frames: readonly ProjectedFrame[], page: string): ProjectedFrame[] {
	return frames.filter((frame) => pageOf(frame) === page);
}

/** What a page is called: its own folder's name, the root page having none. */
export function pageLabel(page: string): string {
	return page === ROOT_PAGE ? "root" : pageName(page);
}

/**
 * The whole of where a page is, for chrome with no tree around it to say. A
 * flat project's pages read the same either way, because a page at the top
 * level is its own name.
 */
export function pagePathLabel(page: string): string {
	return page === ROOT_PAGE ? "root" : page;
}

/** The frame's own source file relative to design/ — the stamp convention. */
export function frameSourceRel(name: string, page: string): string {
	return page === ROOT_PAGE ? `frames/${name}/frame.tsx` : `frames/${page}/${name}/frame.tsx`;
}

/** The same file as an editor path, wherever the frame's page put it. */
export function frameSourcePath(name: string, page: string): string {
	return `design/${frameSourceRel(name, page)}`;
}

/**
 * One page switch: the leaving page keeps its last camera, the arriving page
 * shows its stored one — a caller's arrival camera wins, and none at all
 * means null: fit the field.
 */
export function switchPage(
	cameras: Record<string, Camera>,
	leaving: string,
	leavingCamera: Camera | null,
	arriving: string,
	arriveAt?: Camera,
): { cameras: Record<string, Camera>; camera: Camera | null } {
	const kept = leavingCamera === null ? cameras : { ...cameras, [leaving]: leavingCamera };
	return { cameras: kept, camera: arriveAt ?? kept[arriving] ?? null };
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
