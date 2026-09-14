import type { PlayerConfig } from "./frame-runtime";
import { hostedAccess } from "./hosted-access";

interface PublicationConfig {
	entry: string;
	scenario: string;
	frames: Record<string, { w: number; h: number }>;
	styles: Record<string, string>;
	outgoing: Record<string, string[]>;
	seed: Record<string, unknown>;
}

declare global {
	interface Window {
		__SPOOL_PUBLICATION__?: PublicationConfig;
	}
}

/** The static/hosted adapter holds no local authoring authority. */
export function publicationEnvironment() {
	const host = window.parent === window ? window : window.parent;
	const supplied = window.__SPOOL_PUBLICATION__;
	if (supplied === undefined) throw new Error("Publication configuration is missing.");
	const value = structuredClone(supplied);
	const included = new Set(Object.keys(value.frames));
	const allowed = new Map(Object.entries(value.outgoing).map(([frame, targets]) => [frame, new Set(targets)]));
	const base = new URL("./", document.baseURI);
	const requested = new URL(host.location.href).searchParams.get("frame") ?? value.entry;
	const start = included.has(requested) ? requested : value.entry;
	const access = hostedAccess(host, requested === value.entry ? undefined : requested);
	const config: PlayerConfig = {
		project: "publication",
		projectCapability: "",
		start,
		scenario: value.scenario,
		frames: value.frames,
		styles: value.styles,
		shell: true,
	};
	let message: HTMLElement | undefined;
	function error(text: string): void {
		console.error(`spool: ${text}`);
		message?.remove();
		message = document.createElement("div");
		message.setAttribute("role", "alert");
		message.setAttribute("data-publication-error", "");
		Object.assign(message.style, {
			position: "fixed",
			inset: "auto 16px 16px",
			zIndex: "2147483647",
			padding: "16px",
			background: "#161616",
			color: "#f0efed",
			border: "1px solid #555",
			font: "14px/1.5 system-ui",
		});
		const description = document.createElement("span");
		description.textContent = text;
		const dismiss = document.createElement("button");
		dismiss.type = "button";
		dismiss.textContent = "Dismiss";
		dismiss.style.marginLeft = "16px";
		dismiss.onclick = () => message?.remove();
		message.append(description, dismiss);
		document.body.append(message);
	}
	addEventListener("error", (event) => error(event.message || "A website resource could not be loaded."));
	addEventListener("unhandledrejection", (event) =>
		error(event.reason instanceof Error ? event.reason.message : "The website could not complete an action."),
	);
	const visit = crypto.randomUUID();
	const entries = [start];
	let cursor = 0;
	const urlFor = (frame: string) => {
		const url = new URL(host.location.href);
		url.searchParams.set("frame", frame);
		return url;
	};
	host.history.replaceState({ publicationVisit: visit, index: 0 }, "", urlFor(start));
	if (requested !== start) {
		error(`Frame "${requested}" is not available in this version. Open the entry to start again.`);
		const open = document.createElement("button");
		open.textContent = "Open entry";
		open.onclick = () => host.location.assign(urlFor(value.entry));
		message?.append(open);
	}
	return {
		config,
		resize(frame: string) {
			const width = value.frames[frame]?.w;
			if (width === undefined || window.frameElement === null) return false;
			const changed = window.innerWidth !== Math.min(host.innerWidth, width);
			window.frameElement.setAttribute("style", `max-width:${width}px`);
			return changed;
		},
		seed: value.seed,
		resource: (name: string) => new URL(name, base).href,
		allowed: (from: string, to: string) => {
			access.check();
			return !access.blocked() && included.has(to) && allowed.get(from)?.has(to) === true;
		},
		error,
		clearError: () => message?.remove(),
		copy: (text: string) => navigator.clipboard.writeText(text),
		push(frame: string) {
			if (access.blocked()) return;
			entries.splice(cursor + 1);
			entries.push(frame);
			cursor++;
			host.history.pushState({ publicationVisit: visit, index: cursor }, "", urlFor(frame));
		},
		back() {
			access.check();
			if (!access.blocked() && cursor > 0) host.history.back();
		},
		follow(walk: (frame: string, back: boolean) => Promise<void>) {
			host.addEventListener("popstate", (event) => {
				const state: unknown = event.state;
				access.check();
				if (access.blocked()) return;
				if (
					typeof state !== "object" ||
					state === null ||
					!("publicationVisit" in state) ||
					state.publicationVisit !== visit ||
					!("index" in state) ||
					typeof state.index !== "number" ||
					!Number.isInteger(state.index)
				)
					return;
				const frame = entries[state.index];
				if (frame === undefined || !included.has(frame)) {
					error("That history entry is unavailable.");
					return;
				}
				const back = state.index < cursor;
				cursor = state.index;
				void walk(frame, back).catch((reason: unknown) =>
					error(reason instanceof Error ? reason.message : "The screen could not be loaded."),
				);
			});
		},
	};
}
