import { useCallback, useEffect, useRef, useState } from "react";
import { placeOf } from "../../home-places";
import { NavigateContext } from "./navigate";
import type { ViewerConfig } from "./source";
import { BrowserHome, type HomeConfig } from "./team-home";
import { Viewer } from "./viewer";

/**
 * spool at spool.page in one document: Home and the read-only canvas, each at its own address. Going between them is
 * an instant cut, in place through History with no page load: a cover, the canvas path's first crumb, ⌘↑ from a
 * project's top, and Back and Forward. Home stays behind a canvas, so coming back to it is instant; a canvas is read
 * as it opens, a hairline along the top edge while its data is on the way. Whatever the app can't tell, or can't
 * read, it loads whole, so every one of spool.page's guards on a page still stands.
 */
export function SpoolApp({ home, viewer }: { home: HomeConfig | null; viewer: ViewerConfig | null }) {
	const [teams, setTeams] = useState<ReadonlySet<string>>(() => new Set(teamOf(viewer)));
	const teamsRef = useRef(teams);
	teamsRef.current = teams;
	const [view, setView] = useState<AppView>(() => {
		const at = location.pathname;
		if (viewer !== null && within(at, viewer.path)) return { kind: "canvas", config: viewer, swapped: false };
		return { kind: "home" };
	});
	const viewRef = useRef(view);
	viewRef.current = view;
	/** The view an address is, or null where the app can't tell and the page loads whole. */
	const viewAt = useCallback(
		(path: string): AppView | null => {
			const now = viewRef.current;
			if (now.kind === "canvas" && within(path, now.config.path)) return now;
			const at = appPlace(path, teamsRef.current);
			if (at === null) return null;
			if (at.kind === "home") return home === null ? null : at;
			return { kind: "canvas", config: at.config, swapped: true };
		},
		[home],
	);
	const navigate = useCallback(
		(href: string) => {
			const url = new URL(href, location.href);
			const next = url.origin === location.origin ? viewAt(url.pathname) : null;
			if (next === null) return location.assign(url.href);
			history.pushState({ spool: "app" }, "", url.pathname + url.search + url.hash);
			setView(next);
			window.scrollTo(0, 0);
		},
		[viewAt],
	);
	// Back and Forward: a place the app holds swaps in place, any other address is loaded whole
	useEffect(() => {
		const moved = () => {
			const next = viewAt(location.pathname);
			if (next === null) return location.reload();
			setView(next);
		};
		window.addEventListener("popstate", moved);
		return () => window.removeEventListener("popstate", moved);
	}, [viewAt]);
	// a plain click on a link to one of the app's places stays in the app; a held key or another button opens a tab
	useEffect(() => {
		const clicked = (event: MouseEvent) => {
			if (event.defaultPrevented || event.button !== 0) return;
			if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
			const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
			if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return;
			if (link.target !== "" && link.target !== "_self") return;
			const url = new URL(link.href);
			if (url.origin !== location.origin || viewAt(url.pathname) === null) return;
			// within the canvas on screen, its own links go between its pages
			const now = viewRef.current;
			if (now.kind === "canvas" && within(url.pathname, now.config.path)) return;
			event.preventDefault();
			navigate(url.href);
		};
		document.addEventListener("click", clicked);
		return () => document.removeEventListener("click", clicked);
	}, [navigate, viewAt]);
	const known = useCallback(
		(addresses: readonly string[]) => setTeams(new Set([...addresses, ...teamOf(viewer)])),
		[viewer],
	);
	return (
		<NavigateContext.Provider value={navigate}>
			{home !== null && (
				<div className={view.kind === "home" ? "contents" : "hidden"}>
					<BrowserHome config={home} front={view.kind === "home"} onTeams={known} />
				</div>
			)}
			{view.kind === "canvas" && (
				<Viewer
					key={view.config.path}
					config={view.config}
					swapped={view.swapped}
					onMissing={view.swapped ? () => location.reload() : undefined}
				/>
			)}
		</NavigateContext.Provider>
	);
}

type AppView = { kind: "home" } | { kind: "canvas"; config: ViewerConfig; swapped: boolean };

/** Whether an address is the canvas at `path` or one of its pages. */
const within = (at: string, path: string) => at === path || at.startsWith(`${path}/`);

/** The team a member's canvas config is of, read from its path; none for a share's. */
function teamOf(config: ViewerConfig | null): string[] {
	const [team] = config?.path.split("/").filter(Boolean) ?? [];
	return team === undefined || team === "shared" ? [] : [team];
}

/** Words under `/<team>/` that are the team's own pages at spool.page, never a project. */
const TEAM_PAGES = new Set(["people", "settings", "welcome", "delete", "invites", "leave", "members", "projects"]);

/**
 * What an address at spool.page is to the app, among the teams this account is in: one of Home's places, or a
 * canvas with where its project is read (a member's project, or a people share); null for any other.
 */
export function appPlace(
	path: string,
	teams: ReadonlySet<string>,
): { kind: "home" } | { kind: "canvas"; config: ViewerConfig } | null {
	const [first, second] = path.split("/").filter(Boolean);
	if (first === undefined) return null;
	if (first === "shared")
		return second === undefined
			? { kind: "home" }
			: { kind: "canvas", config: { api: `/api/shares/${second}/canvas`, path: `/shared/${second}` } };
	if (first === "account") return second === undefined ? { kind: "home" } : null;
	if (!teams.has(first)) return null;
	if (second !== undefined && !TEAM_PAGES.has(second))
		return {
			kind: "canvas",
			config: { api: `/api/teams/${first}/projects/${second}/canvas`, path: `/${first}/${second}` },
		};
	return placeOf(path) === null ? null : { kind: "home" };
}
