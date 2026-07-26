import { randomBytes, timingSafeEqual } from "node:crypto";

export const CONTROL_HEADER = "x-spool-control";
export const PROJECT_HEADER = "x-spool-project";
export const CAPTURE_HOST = "capture-spool.localhost";
export const RENDER_HOST = "run.spool.localhost";

/** A daemon-lifetime bearer capability. URL-safe keeps header transport plain. */
export function createCapability(): string {
	return randomBytes(32).toString("base64url");
}

/** Compare credentials without leaking a matching prefix through response time. */
export function matchesCapability(expected: string, actual: string | undefined): boolean {
	if (actual === undefined) return false;
	const left = Buffer.from(expected);
	const right = Buffer.from(actual);
	return left.byteLength === right.byteLength && timingSafeEqual(left, right);
}

/** WHATWG keeps brackets around IPv6 URL hostnames; host policy does not. */
export function normalizeHostname(hostname: string): string {
	const lower = hostname.toLowerCase();
	return lower.startsWith("[") && lower.endsWith("]") ? lower.slice(1, -1) : lower;
}

/** The untrusted virtual host shares the listener's scheme and port, never its cookies. */
export function renderOriginFor(controlOrigin: string): string {
	const url = new URL(controlOrigin);
	url.hostname = RENDER_HOST;
	return url.origin;
}

/** The isolated raster worker shares only the listener's scheme and port. */
export function captureOriginFor(controlOrigin: string): string {
	const url = new URL(controlOrigin);
	url.hostname = CAPTURE_HOST;
	return url.origin;
}
