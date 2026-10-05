/**
 * Frames are https-only, for solo and team projects alike (DEV-175). Frames
 * are served from loopback, so Chrome's local-network prompt never stands
 * between a frame and `http://localhost:3000` or the LAN: a frame a
 * teammate's agent wrote could otherwise probe the machine it plays on.
 *
 * Every document that runs frame code carries this one policy, whoever reads
 * it: the canvas, the player, `spool shot` and the photo booth through the
 * render host's header, and an exported website through its own `<meta>`. A
 * frame keeps everything a prototype needs over https, `data:` and `blob:`,
 * and the spool host it was served from: its vendored libraries, its scenario
 * reads and the player's own modules. Script stays free to run inline and to
 * evaluate, because the point is where a frame can reach, not how it runs.
 *
 * Chrome writes each refusal to the frame's console with the address and the
 * directive it broke, so it reaches `spool logs` and the canvas's devtools.
 */
const REACHABLE = "https: data: blob:";

/** The policy for a frame document, given the source that names its own spool host. */
function frameCsp(spoolHost: string): string {
	return [
		`script-src ${REACHABLE} ${spoolHost} 'unsafe-inline' 'unsafe-eval'`,
		`connect-src ${REACHABLE} ${spoolHost}`,
		`img-src ${REACHABLE} ${spoolHost}`,
	].join("; ");
}

/**
 * The header on every executable document the render host serves. The render
 * host answers only frame documents, vendored libraries, scenario reads and
 * player modules, so naming its origin reaches nothing else of the daemon's.
 * The sandbox keeps the opaque-origin law it always carried.
 */
export function servedFrameCsp(renderOrigin: string): string {
	return `sandbox allow-scripts; ${frameCsp(new URL(renderOrigin).origin)}`;
}

/** The same policy, written into an exported document whose libraries sit beside it. */
export const PUBLISHED_FRAME_CSP_META = `<meta http-equiv="Content-Security-Policy" content="${frameCsp("'self'")}">`;
