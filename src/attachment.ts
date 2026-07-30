/**
 * What an attachment is, in every realm that takes one or sends one (#119).
 *
 * A reference riding with a prompt, look-only, as bytes rather than a path. The
 * bytes go down the same stdin the prompt does, so nothing is written and the
 * app-owned folder gains no inbox, no lifetime and no deleter — the agent's own
 * transcript is the durable copy, outside the repo. The cost is stated rather than
 * hidden: a browser never reveals a dropped file's path, so adding an asset stays a
 * deliberate import into `design/shared/assets/`.
 *
 * One rule, read on both sides. The composer must refuse exactly what the daemon
 * refuses, or a picture draws as attached and then costs somebody their prompt when
 * the turn is turned away.
 */

export interface Attachment {
	readonly media: string;
	readonly data: string;
}

/** What the model reads as a picture, which is the whole of what may ride along. */
export const ATTACHMENT_MEDIA: ReadonlySet<string> = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/**
 * The most one attachment may weigh, decoded — the model's own per-image ceiling.
 *
 * Refusing is deliberate where re-encoding was the alternative: spool downscaling
 * somebody's reference would send the agent a picture nobody looked at.
 */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Whether a file the hands just handed over is one spool can send. */
export function isSendableAttachment(file: { readonly type: string; readonly size: number }): boolean {
	return ATTACHMENT_MEDIA.has(file.type) && file.size <= MAX_ATTACHMENT_BYTES;
}

/** Undefined for anything that is not one picture spool may send. */
export function parseAttachment(value: unknown): Attachment | undefined {
	if (typeof value !== "object" || value === null) return undefined;
	const { media, data } = value as Record<string, unknown>;
	if (typeof media !== "string" || !ATTACHMENT_MEDIA.has(media)) return undefined;
	if (typeof data !== "string" || data === "" || data.length % 4 !== 0) return undefined;
	if (!/^[A-Za-z0-9+/]+={0,2}$/.test(data)) return undefined;
	return attachmentBytes(data) > MAX_ATTACHMENT_BYTES ? undefined : { media, data };
}

/** What the base64 weighs once decoded: four characters carry three bytes. */
export function attachmentBytes(data: string): number {
	return (data.length / 4) * 3 - (data.endsWith("==") ? 2 : data.endsWith("=") ? 1 : 0);
}
