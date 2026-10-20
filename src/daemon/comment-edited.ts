import type { Comment } from "../team-sync-protocol";

/**
 * Which comments' frames were edited since they were made (spool#167: "a comment whose revision differs from its
 * frame's says edited since"): the ids of those standing on a frame whose source revision now is not the one they
 * kept. A frame that doesn't compile or isn't here says nothing either way, and neither does a comment on the field
 * or one that kept no revision. Each frame is asked once.
 */
export async function editedSince(
	comments: readonly Comment[],
	revisionOf: (frame: string) => Promise<string | null>,
): Promise<string[]> {
	const asked = new Map<string, Promise<string | null>>();
	const edited: string[] = [];
	for (const comment of comments) {
		const { frame, revision } = comment;
		if (frame === null || revision === null || comment.standing !== "placed") continue;
		let now = asked.get(frame);
		if (now === undefined) {
			now = revisionOf(frame);
			asked.set(frame, now);
		}
		const current = await now;
		if (current !== null && current !== revision) edited.push(comment.id);
	}
	return edited;
}
