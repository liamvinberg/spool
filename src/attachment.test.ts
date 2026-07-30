import { describe, expect, it } from "vitest";
import { attachmentBytes, isSendableAttachment, MAX_ATTACHMENT_BYTES, parseAttachment } from "./attachment";

/**
 * One rule for what may ride with a prompt (#119), read on both sides: the composer
 * refuses exactly what the daemon refuses, or a picture draws as attached and then
 * costs somebody their prompt when the turn is turned away.
 */

/** base64 comes in groups of four characters carrying three bytes */
const weighing = (bytes: number) => "A".repeat(Math.ceil(bytes / 3) * 4);

describe("an attachment", () => {
	it("is a picture the model reads, and nothing else", () => {
		expect(parseAttachment({ media: "image/png", data: "AAAA" })).toEqual({ media: "image/png", data: "AAAA" });
		for (const media of ["image/jpeg", "image/gif", "image/webp"]) {
			expect(parseAttachment({ media, data: "AAAA" })?.media).toBe(media);
		}
		expect(parseAttachment({ media: "image/svg+xml", data: "AAAA" })).toBeUndefined();
		expect(parseAttachment({ media: "text/plain", data: "AAAA" })).toBeUndefined();
	});

	it("is base64 or it is not an attachment at all", () => {
		expect(parseAttachment({ media: "image/png", data: "A A A" })).toBeUndefined();
		expect(parseAttachment({ media: "image/png", data: "AAA" })).toBeUndefined();
		expect(parseAttachment({ media: "image/png", data: "" })).toBeUndefined();
		expect(parseAttachment("data:image/png;base64,AAAA")).toBeUndefined();
		expect(parseAttachment(null)).toBeUndefined();
	});

	it("is refused over the model's own ceiling rather than re-encoded", () => {
		const under = weighing(MAX_ATTACHMENT_BYTES - 3);
		const over = weighing(MAX_ATTACHMENT_BYTES + 3);

		expect(attachmentBytes(under)).toBeLessThanOrEqual(MAX_ATTACHMENT_BYTES);
		expect(parseAttachment({ media: "image/png", data: under })?.data).toBe(under);
		expect(parseAttachment({ media: "image/png", data: over })).toBeUndefined();
	});

	it("answers the same question about a file the hands just dropped", () => {
		// the composer asks this before it draws a tile, so the two sides cannot
		// disagree about what is sendable
		expect(isSendableAttachment({ type: "image/png", size: 1024 })).toBe(true);
		expect(isSendableAttachment({ type: "image/svg+xml", size: 1024 })).toBe(false);
		expect(isSendableAttachment({ type: "image/png", size: MAX_ATTACHMENT_BYTES })).toBe(true);
		expect(isSendableAttachment({ type: "image/png", size: MAX_ATTACHMENT_BYTES + 1 })).toBe(false);
	});
});
