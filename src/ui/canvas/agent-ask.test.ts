import { describe, expect, it } from "vitest";
import { approvalWhat, detailOf, foldedApproval, questionsOf } from "./agent-ask";

/*
 * What an ask says (#366): what an approval would let through, its kind in a person's
 * words, the one line it folds to once answered, and the questions a call carries.
 */

describe("detailOf", () => {
	it("is the command an approval would run, trimmed", () => {
		expect(detailOf({ command: "  npm install dayjs \n" }, "/p")).toBe("npm install dayjs");
	});

	it("is the file it would change, relative to the project", () => {
		expect(detailOf({ file_path: "/p/src/theme.ts" }, "/p")).toBe("src/theme.ts");
		expect(detailOf({ file_path: "/p/src/theme.ts" }, "/p/")).toBe("src/theme.ts");
		expect(detailOf({ notebook_path: "/p/notes.ipynb" }, "/p")).toBe("notes.ipynb");
	});

	it("keeps a path outside the project whole", () => {
		expect(detailOf({ file_path: "/etc/hosts" }, "/p")).toBe("/etc/hosts");
		expect(detailOf({ file_path: "/pq/x.ts" }, "/p")).toBe("/pq/x.ts");
	});

	it("is nothing for a call that carries neither, which is a connector's", () => {
		expect(detailOf({ query: "roasters" }, "/p")).toBeNull();
		expect(detailOf({ command: "   " }, "/p")).toBeNull();
		expect(detailOf(null, "/p")).toBeNull();
		expect(detailOf("ls", "/p")).toBeNull();
	});
});

describe("approvalWhat", () => {
	it("names what the call does rather than the tool", () => {
		expect(approvalWhat("Bash", "npm test")).toBe("Run a command");
		expect(approvalWhat("WebFetch", null)).toBe("Go on the web");
		expect(approvalWhat("WebSearch", null)).toBe("Go on the web");
		expect(approvalWhat("mcp__linear__create_issue", null)).toBe("Use a tool");
		expect(approvalWhat(null, null)).toBe("Use a tool");
	});

	it("says when an edit reaches outside design/", () => {
		expect(approvalWhat("Edit", "design/frames/home/frame.tsx")).toBe("Edit a file");
		expect(approvalWhat("Write", "src/theme.ts")).toBe("Edit a file outside design/");
		expect(approvalWhat("MultiEdit", null)).toBe("Edit a file");
		expect(approvalWhat("NotebookEdit", "notes.ipynb")).toBe("Edit a file outside design/");
	});
});

describe("foldedApproval", () => {
	it("folds an allow to its verb, with what it let through in mono", () => {
		expect(foldedApproval("allowed", "Edit", "src/theme.ts")).toEqual({
			words: "Allowed: edit",
			mono: "src/theme.ts",
		});
		expect(foldedApproval("allowed", "Bash", "npm test")).toEqual({ words: "Allowed: run", mono: "npm test" });
		expect(foldedApproval("allowed", "WebFetch", null)).toEqual({ words: "Allowed: go on the web", mono: null });
	});

	it("says an always is for this chat", () => {
		expect(foldedApproval("always", "Bash", "npm test")).toEqual({
			words: "Allowed for this chat: run",
			mono: "npm test",
		});
	});

	it("folds a deny to what was refused, and nothing it would have let through", () => {
		expect(foldedApproval("denied", "Bash", "rm -rf build")).toEqual({ words: "Denied: run a command", mono: null });
		expect(foldedApproval("denied", "Write", "src/theme.ts")).toEqual({
			words: "Denied: edit a file outside design/",
			mono: null,
		});
	});
});

describe("questionsOf", () => {
	it("reads every question a call carries, with its options in the agent's words", () => {
		const questions = questionsOf({
			questions: [
				{
					question: "Which direction?",
					header: "Direction",
					options: [{ label: "Calm", description: "Quiet." }, { label: "Bold" }],
				},
				{ question: "Which screens?", header: "Screens", multiSelect: true, options: [{ label: "Orders" }] },
			],
		});
		expect(questions).toEqual([
			{
				header: "Direction",
				question: "Which direction?",
				multi: false,
				options: [
					{ label: "Calm", description: "Quiet." },
					{ label: "Bold", description: "" },
				],
			},
			{
				header: "Screens",
				question: "Which screens?",
				multi: true,
				options: [{ label: "Orders", description: "" }],
			},
		]);
	});

	it("reads nothing out of a call that is not a question, and skips what is not one", () => {
		expect(questionsOf(null)).toEqual([]);
		expect(questionsOf({ questions: "Which?" })).toEqual([]);
		expect(questionsOf({ questions: [null, { header: "x" }, { question: "Ok?", options: [{ value: 1 }] }] })).toEqual(
			[{ header: "", question: "Ok?", multi: false, options: [] }],
		);
	});
});
