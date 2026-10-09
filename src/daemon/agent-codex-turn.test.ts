import { describe, expect, it } from "vitest";
import { codexInput, inDesign, isSpoolRead, quietApproval } from "./agent-codex-turn";

describe("what spool answers for the person", () => {
	const root = "/p";
	it("reads design/ by path, never a sibling that only starts the same", () => {
		expect(inDesign(root, "/p/design/frames/a/frame.tsx")).toBe(true);
		expect(inDesign(root, "design/x.ts")).toBe(true);
		expect(inDesign(root, "/p/design")).toBe(false);
		expect(inDesign(root, "/p/designs/x")).toBe(false);
		expect(inDesign(root, "/p/design/../src/x")).toBe(false);
		expect(inDesign(root, "/elsewhere/design/x")).toBe(false);
	});

	it("takes one plain spool read verb, never a chain or a write", () => {
		expect(isSpoolRead("spool skill")).toBe(true);
		expect(isSpoolRead("spool shot frames/a")).toBe(true);
		expect(isSpoolRead("spool url && rm -rf .")).toBe(false);
		expect(isSpoolRead("spool status > out.txt")).toBe(false);
		expect(isSpoolRead("spool init")).toBe(false);
		expect(isSpoolRead("spoolx skill")).toBe(false);
	});

	it("answers a file change by the item's paths and a command by every part Codex split it into", () => {
		const change = (path: string) => ({ id: "c", type: "fileChange", changes: [{ path, kind: { type: "add" } }] });
		expect(quietApproval(root, "item/fileChange/requestApproval", {}, change("/p/design/a.tsx"))).toBe(true);
		expect(quietApproval(root, "item/fileChange/requestApproval", {}, change("/p/src/a.tsx"))).toBe(false);
		expect(quietApproval(root, "item/fileChange/requestApproval", {})).toBe(false);
		const command = (...commands: string[]) => ({
			commandActions: commands.map((one) => ({ type: "unknown", command: one })),
		});
		expect(quietApproval(root, "item/commandExecution/requestApproval", command("spool skill"))).toBe(true);
		expect(quietApproval(root, "item/commandExecution/requestApproval", command("spool skill", "rm x"))).toBe(false);
		expect(quietApproval(root, "item/commandExecution/requestApproval", {})).toBe(false);
	});

	it("puts pictures before words, as Codex's input list", () => {
		expect(
			codexInput([{ prompt: "look", selection: "frame a", attachments: [{ media: "image/png", data: "aGk=" }] }]),
		).toEqual([
			{ type: "image", url: "data:image/png;base64,aGk=" },
			{ type: "text", text: "frame a\n\nlook", text_elements: [] },
		]);
	});
});
