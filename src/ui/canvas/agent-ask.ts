import type { CallInput } from "./agent-nouns";

/**
 * What the rail draws when the turn is waiting on the person (#121, #145, #162).
 *
 * Two things arrive on one channel and this is where they part. An approval carries
 * the agent's own written description of what it wants to do and the rules an
 * "always" would grant; the agent's own question carries neither, and carries its
 * options inside the call's own arguments instead. Measured across all twelve asks in
 * `claude-mcp.json`: the one flagged as needing the person has no description and no
 * suggestions, and the eleven that are not flagged have both.
 *
 * Nothing here supplies wording. Every question, header, label and description is the
 * agent's own, and the only words spool contributes are its own controls.
 */

/** one of the two-to-four choices a question offers, in the agent's own words */
export interface AskOption {
	readonly label: string;
	/**
	 * What the choice costs, in the agent's own sentence or three.
	 *
	 * 150 to 250 characters in the captured ask, and the reason the options are a
	 * block in the log rather than chips beside the composer: three of these are
	 * comparable side by side and are not readable at all in a chip.
	 */
	readonly description: string;
}

export interface AskQuestion {
	/** the agent's own short name for the decision, twelve characters at most */
	readonly header: string;
	readonly question: string;
	readonly options: readonly AskOption[];
}

/** the call the agent stops the turn with, which is a question rather than work */
export const ASK_TOOL = "AskUserQuestion";

/**
 * The questions a whole `AskUserQuestion` call carries.
 *
 * Every one of them, not the first: the schema takes one to four and the binary
 * rejects any with fewer than two options before the person ever sees it, so a call
 * with two questions is two decisions somebody has to make. Drawing one and answering
 * for the rest would tell the agent the person declined a question they were never
 * shown. The evidence holds exactly one, which is the case this draws identically.
 *
 * Only the whole call, never the fragments: the options are objects rather than
 * strings and partial JSON splits mid-token, so half an option list is not a shorter
 * one. The question's own sentence types itself in from the fragments instead.
 */
export function questionsOf(input: CallInput): readonly AskQuestion[] {
	const asked = typeof input === "object" && input !== null ? (input as { questions?: unknown }).questions : undefined;
	if (!Array.isArray(asked)) return [];
	const questions: AskQuestion[] = [];
	for (const raw of asked) {
		const one = raw as { question?: unknown; header?: unknown; options?: unknown } | null;
		if (one === null || typeof one?.question !== "string") continue;
		const offered = Array.isArray(one.options) ? one.options : [];
		questions.push({
			header: typeof one.header === "string" ? one.header : "",
			question: one.question,
			options: offered
				.filter((option): option is { label: string; description?: unknown } => typeof option?.label === "string")
				.map((option) => ({
					label: option.label,
					description: typeof option.description === "string" ? option.description : "",
				})),
		});
	}
	return questions;
}
