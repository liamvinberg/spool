import { Terminal } from "@xterm/xterm";
import { cellsForPx, TERM_FONT_PX, TERM_LINE_HEIGHT } from "../term/cells";
import { TERM_ANSI, TERM_BACKGROUND, TERM_CURSOR, TERM_FOREGROUND } from "../term/theme";
import { exitChipLabel, termKeyIntent } from "./term-keys";

/**
 * The terminal runtime (#42): the browser half of a terminal frame. It paints
 * the daemon's PTY stream through the pinned emulator and speaks the host
 * protocol a canvas expects — loaded, key, zoom, pick, sites — while honoring
 * the parity law for keys: an entered terminal owns the whole keyboard,
 * Escape and Ctrl+C included, because those belong to the TUI. The one way
 * out is the platform modifier + Escape, a chord terminals have never
 * transmitted to apps, so no TUI can want it.
 *
 * Freeze is relayed to the daemon (SIGSTOP — kernel-frozen, zero CPU) rather
 * than shimmed: a real process has no timers to wrap.
 */

interface TermDoc {
	project: string;
	frame: string;
}

const doc = (window as unknown as { __SPOOL__?: TermDoc }).__SPOOL__ ?? { project: "", frame: "" };
const embedded = window.parent !== window;

function post(message: Record<string, unknown>): void {
	if (embedded) window.parent.postMessage({ ...message, frame: doc.frame }, "*");
}

const theme = {
	background: TERM_BACKGROUND,
	foreground: TERM_FOREGROUND,
	cursor: TERM_CURSOR,
	black: TERM_ANSI[0],
	red: TERM_ANSI[1],
	green: TERM_ANSI[2],
	yellow: TERM_ANSI[3],
	blue: TERM_ANSI[4],
	magenta: TERM_ANSI[5],
	cyan: TERM_ANSI[6],
	white: TERM_ANSI[7],
	brightBlack: TERM_ANSI[8],
	brightRed: TERM_ANSI[9],
	brightGreen: TERM_ANSI[10],
	brightYellow: TERM_ANSI[11],
	brightBlue: TERM_ANSI[12],
	brightMagenta: TERM_ANSI[13],
	brightCyan: TERM_ANSI[14],
	brightWhite: TERM_ANSI[15],
};

const grid = () => cellsForPx(document.documentElement.clientWidth, document.documentElement.clientHeight);

// the pinned font must be the one measured: the emulator derives its cell box
// from whatever face is loaded at open, and a fallback-measured cell breaks
// the 9×18 contract every other layer computes with — the grid renders
// stretched and clipped. Bounded, so an unloadable font degrades, never blocks.
await Promise.race([
	Promise.all([
		document.fonts.load(`${TERM_FONT_PX}px "JetBrains Mono"`),
		document.fonts.load(`700 ${TERM_FONT_PX}px "JetBrains Mono"`),
	]),
	new Promise((resolve) => setTimeout(resolve, 2000)),
]).catch(() => {});

const start = grid();
const term = new Terminal({
	cols: start.cols,
	rows: start.rows,
	fontFamily: '"JetBrains Mono", monospace',
	fontSize: TERM_FONT_PX,
	lineHeight: TERM_LINE_HEIGHT,
	letterSpacing: 0,
	theme,
	drawBoldTextInBrightColors: false,
	scrollback: 1000,
});

const host = document.getElementById("term");
if (host === null) throw new Error("spool: the terminal document has no #term");
term.open(host);
// booting already focused — a player walk arriving (#44), an entered reload —
// is the enter gesture: hand the keyboard straight to the emulator
if (document.hasFocus()) term.focus();

let exited = false;
let chip: HTMLElement | undefined;

function showExit(code: number): void {
	exited = true;
	host?.classList.add("spool-exited");
	if (chip === undefined) {
		chip = document.createElement("div");
		chip.className = "spool-exit-chip";
		document.body.appendChild(chip);
	}
	chip.textContent = exitChipLabel(code);
	if (code !== 0) chip.setAttribute("data-failed", "");
	else chip.removeAttribute("data-failed");
	chip.hidden = false;
}

function clearExit(): void {
	exited = false;
	host?.classList.remove("spool-exited");
	if (chip !== undefined) chip.hidden = true;
}

// ---- the daemon bridge -----------------------------------------------------

let ws: WebSocket | undefined;
let loadedReported = false;

function connect(): void {
	const url = `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/term/${encodeURIComponent(doc.project)}/${encodeURIComponent(doc.frame)}`;
	const socket = new WebSocket(url);
	socket.binaryType = "arraybuffer";
	ws = socket;

	socket.addEventListener("open", () => {
		// every connection re-asks: the daemon's session may predate this
		// document and hold another size
		lastSent = { cols: 0, rows: 0 };
		sendResize();
		if (!loadedReported) {
			loadedReported = true;
			post({ spool: "loaded" });
		}
	});
	socket.addEventListener("message", (event) => {
		if (typeof event.data === "string") {
			const message = JSON.parse(event.data) as {
				t: string;
				code?: number;
				target?: string;
				state?: string;
				attach?: boolean;
				cols?: number;
				rows?: number;
			};
			if (message.t === "size") {
				// the daemon owns the grid: adopt its size so the replayed screen
				// lands on the columns it was painted at — our own wish is already
				// racing there as a resize, and its application echoes back here
				if (typeof message.cols === "number" && typeof message.rows === "number") {
					if (term.cols !== message.cols || term.rows !== message.rows) term.resize(message.cols, message.rows);
				}
			} else if (message.t === "exit") {
				// an attach-time corpse met with focus is being entered — a walk
				// arrival, an entered boot — and entering revives (#44). A death
				// watched live never respawns by itself.
				if (message.attach === true && document.hasFocus()) control({ t: "revive" });
				else showExit(message.code ?? 0);
			} else if (message.t === "restart") {
				term.reset();
				clearExit();
			} else if (message.t === "state") clearExit();
			else if (message.t === "nav" && typeof message.target === "string") {
				// the host is the witness (flow-map law): the canvas only records a
				// walk it watched from an entered frame
				post({ spool: "go", target: message.target });
			}
			return;
		}
		term.write(new Uint8Array(event.data as ArrayBuffer));
	});
	socket.addEventListener("close", () => {
		ws = undefined;
		// the daemon may be restarting — keep trying while the document lives
		window.setTimeout(() => {
			if (ws === undefined) {
				term.reset();
				connect();
			}
		}, 2000);
	});
}

function control(message: Record<string, unknown>): void {
	if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
}

const encoder = new TextEncoder();

term.onData((data) => {
	if (ws?.readyState === WebSocket.OPEN) ws.send(encoder.encode(data));
});
term.onBinary((data) => {
	if (ws?.readyState === WebSocket.OPEN) ws.send(Uint8Array.from(data, (c) => c.charCodeAt(0)));
});

let lastSent = { cols: 0, rows: 0 };
function sendResize(): void {
	// ask, never apply: the emulator follows the daemon's size echo, so the
	// screen and the process can never disagree about columns
	const size = grid();
	if (size.cols !== lastSent.cols || size.rows !== lastSent.rows) {
		lastSent = size;
		control({ t: "resize", cols: size.cols, rows: size.rows });
	}
}

let resizeQueued = false;
window.addEventListener("resize", () => {
	if (resizeQueued) return;
	resizeQueued = true;
	requestAnimationFrame(() => {
		resizeQueued = false;
		sendResize();
	});
});

// ---- keys: full passthrough, one way out -----------------------------------

// the chord is caught at the window, capture phase: it must work from
// anywhere in the document — a dead TUI, a click that moved focus off the
// emulator — or entering becomes a trap. Stopping propagation keeps it from
// the emulator too: no terminal has ever transmitted it, so none may start.
window.addEventListener(
	"keydown",
	(event) => {
		if (termKeyIntent(event) !== "exit") return;
		event.preventDefault();
		event.stopImmediatePropagation();
		post({ spool: "key", key: "Escape" });
	},
	{ capture: true },
);

// pinch-zoom belongs to the canvas; ordinary wheel stays the terminal's scrollback
window.addEventListener(
	"wheel",
	(event) => {
		if (!event.ctrlKey && !event.metaKey) return;
		event.preventDefault();
		post({
			spool: "zoom",
			kind: "wheel",
			x: event.clientX,
			y: event.clientY,
			deltaY: event.deltaY,
			deltaMode: event.deltaMode,
		});
	},
	{ passive: false, capture: true },
);

// entering a dead terminal revives it — one gesture, never an automatic respawn
window.addEventListener("focus", () => {
	if (exited) control({ t: "revive" });
	term.focus();
});
// the same gesture from inside: a frame that died while entered never gets a
// fresh focus event, so a click on the corpse is the revival
window.addEventListener("mousedown", () => {
	if (exited) control({ t: "revive" });
});

// ---- host protocol odds and ends -------------------------------------------

window.addEventListener("message", (event) => {
	const m = event.data as { spool?: string; on?: boolean; id?: number };
	if (m === null || typeof m !== "object") return;
	if (m.spool === "freeze") control({ t: "freeze", on: m.on === true });
	// a terminal has no elements to pick and no site anchors; answer so the
	// canvas never waits on a reply that cannot come
	else if (m.spool === "pick" && typeof m.id === "number") post({ spool: "picked", id: m.id, chain: [] });
	else if (m.spool === "sites" && typeof m.id === "number") post({ spool: "site-boxes", id: m.id, boxes: {} });
});

connect();
