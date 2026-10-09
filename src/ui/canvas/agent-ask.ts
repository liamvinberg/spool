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
	/** the agent asked for any number of the options rather than one (#366) */
	readonly multi: boolean;
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
		const one = raw as { question?: unknown; header?: unknown; options?: unknown; multiSelect?: unknown } | null;
		if (one === null || typeof one?.question !== "string") continue;
		const offered = Array.isArray(one.options) ? one.options : [];
		questions.push({
			header: typeof one.header === "string" ? one.header : "",
			question: one.question,
			multi: one.multiSelect === true,
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

/**
 * What an approval would let through, behind its quiet disclosure (#366): the command it
 * runs or the file it changes, project-relative. Null where the call carries neither,
 * which is a connector's call: its row already names it.
 */
export function detailOf(input: unknown, root: string): string | null {
	if (typeof input !== "object" || input === null) return null;
	const call = input as { command?: unknown; file_path?: unknown; notebook_path?: unknown };
	if (typeof call.command === "string" && call.command.trim() !== "") return call.command.trim();
	const path = typeof call.file_path === "string" ? call.file_path : call.notebook_path;
	if (typeof path !== "string" || path === "") return null;
	const prefix = root === "" ? "" : root.endsWith("/") ? root : `${root}/`;
	return prefix !== "" && path.startsWith(prefix) ? path.slice(prefix.length) : path;
}

/** an approval's kind, in a person's words: the label its disclosure opens from */
export function approvalWhat(tool: string | null, detail: string | null): string {
	if (tool === "Bash") return "Run a command";
	if (tool === "Write" || tool === "Edit" || tool === "MultiEdit" || tool === "NotebookEdit") {
		return detail !== null && !detail.startsWith("design/") ? "Edit a file outside design/" : "Edit a file";
	}
	if (tool === "WebFetch" || tool === "WebSearch") return "Go on the web";
	return "Use a tool";
}

/**
 * The one quiet line an answered approval folds to (#366): "Allowed: edit src/theme.ts",
 * "Denied: run a command". The words, then the path or command in mono where there is one.
 */
export function foldedApproval(
	state: "allowed" | "always" | "denied",
	tool: string | null,
	detail: string | null,
): { words: string; mono: string | null } {
	const what = approvalWhat(tool, detail);
	if (state === "denied") return { words: `Denied: ${what.charAt(0).toLowerCase()}${what.slice(1)}`, mono: null };
	const lead = state === "always" ? "Allowed for this chat:" : "Allowed:";
	const verb =
		tool === "Bash" ? "run" : what.startsWith("Edit") ? "edit" : what.charAt(0).toLowerCase() + what.slice(1);
	return detail === null ? { words: `${lead} ${verb}`, mono: null } : { words: `${lead} ${verb}`, mono: detail };
}
