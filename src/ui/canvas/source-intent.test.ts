import { expect, it } from "vitest";
import { preparedHelp, type SourceIntent } from "./source-intent";

/**
 * What a refused move hands the Agent composer (#308, #310): the attempt, the
 * reason it was refused, the order that was asked for and the target it was
 * asked about. Preparing it is not sending it.
 */
const REFUSED: SourceIntent = {
	id: "intent",
	frame: "home",
	selector: "screen > ul > li",
	selection: [],
	operation: { kind: "reorder", steps: 2 },
	change: { kind: "reorder" },
	action: "move this element after 2 of its siblings",
	source: "frames/home/frame.tsx:7:4",
	role: "structural-unit",
	scope: "call-site",
	original: {
		publication: "publication",
		cell: "cell",
		occurrence: "occurrence",
		invocation: "invocation",
		value: "",
		context: "context",
	},
};

it("prepares the stable-key refusal with the requested order and the original target", () => {
	const text = preparedHelp(
		REFUSED,
		"stable authored keys required; unsafe unkeyed state transfer. Moving these items could exchange their running state, so nothing was saved.",
		false,
	);
	expect(text).toContain("I tried to move this element after 2 of its siblings.");
	expect(text).toContain("stable authored keys required");
	expect(text).toContain("Requested move: 2 places later among its authored siblings.");
	expect(text).toContain("Target: home, screen > ul > li.");
	expect(text).toContain("Source: frames/home/frame.tsx:7:4.");
	expect(text).toContain("Role: structural-unit. Scope: call-site.");
});

it("says which way a single-place move was asked to go", () => {
	const text = preparedHelp({ ...REFUSED, operation: { kind: "reorder", steps: -1 } }, "refused", false);
	expect(text).toContain("Requested move: 1 place earlier among its authored siblings.");
});
