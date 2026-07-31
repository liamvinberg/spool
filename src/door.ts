import { DEFAULT_PORT } from "./daemon/loopback";

/**
 * The hosted front door.
 *
 * local.spool.page is a static page that listens for this daemon from a
 * visitor's browser and redirects to it the moment it answers — the
 * drizzle-studio pattern, and the address a person can remember when the raw
 * one has left their head (liamvinberg/spool-cloud#8). It is a door, not an
 * app: no work of theirs ever passes through it, and after the redirect
 * everything is same-origin local again.
 *
 * The CLI keeps printing the raw URL first, because that is the truth and the
 * thing agents use. This is the second line.
 */
export const DOOR_HOST = "local.spool.page";

/** The origin the daemon lets read `/api/health`, so the door can tell it is spool. */
export const DOOR_ORIGIN = `https://${DOOR_HOST}`;

/**
 * How to say "this daemon" to the door, or nothing if it cannot be said.
 *
 * The page has no port field, on purpose — a page that lets you type a port is a
 * page that scans your machine — so a daemon that has moved travels as a `?port=`
 * the CLI hands out rather than as something a visitor types.
 *
 * It returns nothing for a daemon the door cannot actually reach. The page
 * probes the literal address 127.0.0.1 and nothing else, so `::1` is out of its
 * sight; a printed line pointing there would be wrong in the one place the CLI
 * is supposed to be the truth.
 */
export function doorAddressFor(daemonUrl: string): string | undefined {
	let url: URL;
	try {
		url = new URL(daemonUrl);
	} catch {
		return undefined;
	}
	if (url.hostname !== "127.0.0.1" && url.hostname !== "localhost") return undefined;
	if (url.port === "" || url.port === String(DEFAULT_PORT)) return DOOR_HOST;
	return `${DOOR_HOST}/?port=${url.port}`;
}
