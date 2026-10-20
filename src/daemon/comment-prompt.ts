import { type Attachment, MAX_ATTACHMENT_BYTES } from "../attachment";
import type { Comment } from "../team-sync-protocol";
import { commentBlock, commentBlocks } from "./comment-block";

/**
 * Comments a person sent to their agent ("Send to agent", spool#172), as the turn's prompt carries them: each as the
 * one `<comment>` block the verb prints, and for a comment whose frame was edited since, the still it kept of the
 * frame then, riding as a picture so the agent sees what the commenter saw.
 *
 * A comment is read from the snapshot the daemon holds at the moment of the send, so a reply that arrived while the
 * words waited in the queue goes out with it. One that isn't there anymore is said to be gone, never dropped in
 * silence. A still that can't be had (offline, or the comment kept none) leaves the block saying only that the frame
 * changed.
 */
export interface CommentPrompt {
	text: string;
	attachments: Attachment[];
}

export async function commentsForPrompt(
	ids: readonly string[],
	deps: {
		comments: readonly Comment[];
		still: (comment: string) => Promise<Uint8Array | undefined>;
	},
): Promise<CommentPrompt> {
	const sent = [...new Set(ids)];
	const found = sent.flatMap((id) => deps.comments.filter((comment) => comment.id === id));
	const blocks: string[] = [];
	const attachments: Attachment[] = [];
	for (const id of sent) {
		const comment = found.find((one) => one.id === id);
		if (comment === undefined) {
			blocks.push(`<comment id="${id}">\nthis comment isn't there anymore\n</comment>`);
			continue;
		}
		// the team says which frames moved on since (spool#160): one rule for the canvas, the verb and the prompt
		const editedSince = comment.editedSince === true;
		const still = editedSince && comment.still ? pictureOf(await deps.still(id).catch(() => undefined)) : undefined;
		if (still !== undefined) attachments.push(still);
		blocks.push(commentBlock(comment, { editedSince, still: still !== undefined }));
	}
	return { text: commentBlocks(blocks), attachments };
}

/** A still's bytes as a picture the agent may be sent: its type read from the bytes, within the size a model takes. */
function pictureOf(bytes: Uint8Array | undefined): Attachment | undefined {
	if (bytes === undefined || bytes.byteLength === 0 || bytes.byteLength > MAX_ATTACHMENT_BYTES) return undefined;
	const media = mediaOf(bytes);
	return media === undefined ? undefined : { media, data: Buffer.from(bytes).toString("base64") };
}

function mediaOf(bytes: Uint8Array): string | undefined {
	const starts = (...head: number[]) => head.every((byte, at) => bytes[at] === byte);
	if (starts(0x89, 0x50, 0x4e, 0x47)) return "image/png";
	if (starts(0xff, 0xd8, 0xff)) return "image/jpeg";
	if (starts(0x52, 0x49, 0x46, 0x46) && String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP") return "image/webp";
	if (starts(0x47, 0x49, 0x46, 0x38)) return "image/gif";
	return undefined;
}
