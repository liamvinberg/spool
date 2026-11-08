import { createHash } from "node:crypto";

/**
 * What a reference's page did with the site's script, done by one small script of spool's own (spool#241), the only
 * one its page may run: the page's Content-Security-Policy names it by its hash, so nothing the site's markup might
 * still carry runs beside it. Its links stay put (a site mostly refuses to load in a frame, which left it white), the
 * videos that played play, and what the site changed as the hand came over a part (spool's Chrome extension watched
 * it, `extension/src/hovers.ts`) changes again.
 */
export const REFERENCE_LIVE_JS = `(() => {
	const doc = document;
	doc.addEventListener("click", (event) => {
		const target = event.target;
		if (target instanceof Element && target.closest("a[href], area[href]")) event.preventDefault();
	}, true);
	doc.addEventListener("submit", (event) => event.preventDefault(), true);
	const roots = [doc];
	for (let i = 0; i < roots.length; i++) {
		for (const el of roots[i].querySelectorAll("*")) if (el.shadowRoot) roots.push(el.shadowRoot);
	}
	const all = (selector) => roots.flatMap((root) => Array.from(root.querySelectorAll(selector)));
	const play = (el, on) => {
		if (!(el instanceof HTMLMediaElement)) return;
		el.muted = true;
		if (on) el.play().catch(() => {});
		else el.pause();
	};
	for (const video of all("video[data-spool-playing]")) play(video, true);
	const hovers = new Map();
	for (const el of all("[data-spool-hover-set]")) {
		let list;
		try {
			list = JSON.parse(el.getAttribute("data-spool-hover-set"));
		} catch {
			continue;
		}
		if (!Array.isArray(list)) continue;
		for (const [id, name, value] of list) {
			const rest = name === ":playing" ? (el.hasAttribute("data-spool-playing") ? "1" : null) : el.getAttribute(name);
			hovers.set(id, [...(hovers.get(id) || []), { el, name, value, rest }]);
		}
	}
	const hover = (id, on) => {
		for (const change of hovers.get(id) || []) {
			const value = on ? change.value : change.rest;
			try {
				if (change.name === ":playing") play(change.el, value !== null);
				else if (value === null) change.el.removeAttribute(change.name);
				else change.el.setAttribute(change.name, value);
			} catch {}
		}
	};
	for (const trigger of all("[data-spool-hover]")) {
		const id = trigger.getAttribute("data-spool-hover");
		trigger.addEventListener("mouseenter", () => hover(id, true));
		trigger.addEventListener("mouseleave", () => hover(id, false));
	}
})();`;

/** what goes first in the page's head: the policy that lets spool's script alone run, and links that go nowhere */
export function referenceLiveHead(): string {
	const hash = createHash("sha256").update(REFERENCE_LIVE_JS).digest("base64");
	return [
		`<meta http-equiv="Content-Security-Policy" content="script-src 'sha256-${hash}'">`,
		// a new tab the sandbox refuses, should the script not run
		'<base target="_blank">',
	].join("\n");
}

/** what goes last in the page's body */
export function referenceLiveScript(): string {
	return `<script>${REFERENCE_LIVE_JS}</script>`;
}
