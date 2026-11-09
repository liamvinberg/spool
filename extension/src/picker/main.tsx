import fragmentMono from "@fontsource/fragment-mono/files/fragment-mono-latin-400-normal.woff2?inline";
import instrumentSans from "@fontsource-variable/instrument-sans/files/instrument-sans-latin-wght-normal.woff2?inline";
import { useEffect, useRef } from "react";
import { createRoot } from "react-dom/client";
import { capture, readCanvases } from "../capture";
import { type HoverWatch, hoverables, watchHovers } from "../hovers";
import { type Ask, type OpenAnswer, PICKER_GLOBAL, type PickerHandle, type SendAnswer } from "../messages";
import { MOTION, Overlay } from "./overlay";
import css from "./overlay.css?inline";
import { shadowCss } from "./shadow-css";
import { type Delivery, usePicker } from "./use-picker";

/**
 * The content script: the picker, mounted over the page in a shadow root on a host at the top of the stacking order,
 * which the pointer passes through (only the tab takes it, when it holds). Injected by the service worker on the
 * first click of the icon; later clicks toggle it through the handle it leaves in the tab's isolated world.
 */

/** the host sits above everything and takes nothing from the page's sheets */
const HOST_STYLE = [
	"all: initial",
	"position: fixed",
	"inset: 0",
	"width: 100vw",
	"height: 100vh",
	"max-width: none",
	"max-height: none",
	"margin: 0",
	"padding: 0",
	"border: 0",
	"background: transparent",
	"overflow: visible",
	"display: block",
	"z-index: 2147483647",
	"pointer-events: none",
]
	.map((d) => `${d} !important`)
	.join("; ");

function mount(): void {
	const g = globalThis as Record<string, unknown>;
	const there = g[PICKER_GLOBAL] as PickerHandle | undefined;
	if (there !== undefined) {
		there.toggle();
		return;
	}

	const host = document.createElement("spool-picker");
	host.setAttribute("style", HOST_STYLE);
	document.documentElement.append(host);
	// the top layer, so it is drawn over the page's own dialogs and popovers too
	try {
		host.popover = "manual";
		host.showPopover();
	} catch {
		// no popovers here: the z-index holds
	}
	const root = host.attachShadow({ mode: "open" });
	const sheet = shadowCss(css);
	try {
		const adopted = new CSSStyleSheet();
		adopted.replaceSync(sheet);
		root.adoptedStyleSheets = [adopted];
	} catch {
		const style = document.createElement("style");
		style.textContent = sheet;
		root.append(style);
	}
	fonts();
	const at = document.createElement("div");
	root.append(at);
	const handle: PickerHandle = { toggle: () => {} };
	g[PICKER_GLOBAL] = handle;
	// from here on, what the site does as the hand moves over it is watched, for the reference to do again
	ours = (el) => el === host || el.getRootNode() === root;
	hovers = watchHovers(document, ours);
	const react = createRoot(at);
	// an extension removed or reloaded leaves this script behind without a runtime: the next touch takes it all away
	const orphaned = () => {
		if (chrome.runtime?.id !== undefined) return;
		for (const type of ORPHAN_WATCH) window.removeEventListener(type, orphaned, true);
		react.unmount();
		hovers?.stop();
		host.remove();
		delete g[PICKER_GLOBAL];
	};
	for (const type of ORPHAN_WATCH) window.addEventListener(type, orphaned, true);
	react.render(<Picker host={host} handle={handle} />);
}

const ORPHAN_WATCH = ["keydown", "pointerdown", "pointermove"] as const;

let hovers: HoverWatch | undefined;
let ours: (el: Element) => boolean = () => false;
/** how long a send may spend hovering what it takes, for the hovers the hand never went over */
const PROBE_MS = 1500;

function Picker({ host, handle }: { host: HTMLElement; handle: PickerHandle }) {
	const hostRef = useRef<HTMLElement | null>(host);
	const c = usePicker({ host: hostRef, deliver, sendMs: 700, holdPx: 140, restMs: MOTION.rest * 1000 });
	useEffect(() => {
		handle.toggle = () => {
			// back on top of whatever the page has put in the top layer since
			if (host.matches(":popover-open")) {
				host.hidePopover();
				host.showPopover();
			}
			c.toggle();
		};
	}, [handle, host, c.toggle]);
	const receipt = c.receipt;
	const onOpen = () => {
		if (receipt === null) return;
		const ask: Ask = { type: "spool:open", open: { project: receipt.project, frame: receipt.frame } };
		void chrome.runtime.sendMessage<OpenAnswer>(ask).catch(() => {});
	};
	return <Overlay c={c} onOpen={onOpen} />;
}

async function deliver(grab: { el: Element; whole: boolean; label: string }): Promise<Delivery> {
	const started = performance.now();
	if (hovers !== undefined) await hovers.probe(hoverables(grab.el, ours), PROBE_MS);
	const probed = performance.now();
	const drawn = await readCanvases(grab.el);
	const read = performance.now();
	const taken = capture(grab, {
		closedShadowRoot: (el) =>
			el.localName.includes("-") ? chrome.dom.openOrClosedShadowRoot(el as HTMLElement) : null,
		drawn,
		...(hovers === undefined ? {} : { hovers: hovers.read() }),
	});
	const ms = (from: number, to: number) => Math.round(to - from);
	console.debug(
		`spool: captured ${grab.label} in ${ms(started, performance.now())} ms (hovers ${ms(started, probed)} ms, canvases ${ms(probed, read)} ms)`,
	);
	const ask: Ask = { type: "spool:send", capture: taken };
	const answer = await chrome.runtime.sendMessage<SendAnswer>(ask);
	return answer ?? { ok: false, offline: true };
}

/** spool's faces, on the document: `@font-face` does not reach into a shadow root, a document's fonts do */
function fonts(): void {
	const faces = [
		new FontFace("Instrument Sans Variable", bytes(instrumentSans), { weight: "400 700" }),
		new FontFace("Fragment Mono", bytes(fragmentMono), { weight: "400" }),
	];
	for (const face of faces) {
		document.fonts.add(face);
		void face.load().catch(() => {});
	}
}

function bytes(dataUrl: string): Uint8Array<ArrayBuffer> {
	const raw = atob(dataUrl.slice(dataUrl.indexOf(",") + 1));
	const out = new Uint8Array(raw.length);
	for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
	return out;
}

mount();
