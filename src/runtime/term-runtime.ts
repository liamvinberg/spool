import { Terminal } from "@xterm/xterm";
import { cellsForViewport, TERM_FONT_PX, TERM_LINE_HEIGHT } from "../term/cells";
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

// the nearest grid, not the floor: the hosting chrome shaves a pixel or two
// off the authored box, and losing a cell to that would fork this surface's
// grid from the sidecar's — the one every other surface derives
const grid = () => cellsForViewport(document.documentElement.clientWidth, document.documentElement.clientHeight);

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
// the pinned mono must be the measured font: xterm sizes its cells once at
// open, and fallback-measured rows overshoot 18px — the grid then clips its
// last rows. The race keeps a broken font from ever holding the boot.
await Promise.race([
	document.fonts.load(`${TERM_FONT_PX}px "JetBrains Mono"`).catch(() => {}),
	new Promise((resolve) => setTimeout(resolve, 1500)),
]);
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

let playerHosted = false;

// the exit chord is claimed at the document level, capture-phase: focus can
// sit on the body or the exit chip rather than the emulator's textarea, and
// the one way out must work from anywhere inside the frame
window.addEventListener(
	"keydown",
	(event) => {
		if (termKeyIntent(event, !playerHosted) !== "exit") return;
		event.preventDefault();
		post({ spool: "key", key: "Escape" });
	},
	{ capture: true },
);

// the emulator only suppresses the chord — the relay above already spoke
term.attachCustomKeyEventHandler((event) => {
	if (event.type !== "keydown") return true;
	return termKeyIntent(event, !playerHosted) !== "exit";
});

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
	const m = event.data as { spool?: string; surface?: string; on?: boolean; id?: number };
	if (m === null || typeof m !== "object") return;
	if (m.spool === "focus") {
		playerHosted = m.surface === "player";
		term.focus();
	} else if (m.spool === "freeze") control({ t: "freeze", on: m.on === true });
	// a terminal has no elements to pick and no site anchors; answer so the
	// canvas never waits on a reply that cannot come
	else if (m.spool === "pick" && typeof m.id === "number") post({ spool: "picked", id: m.id, chain: [] });
	else if (m.spool === "sites" && typeof m.id === "number") post({ spool: "site-boxes", id: m.id, boxes: {} });
});

connect();
