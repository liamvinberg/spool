import { expect, it, vi } from "vitest";
import type { SourceRead } from "../../source-edit";
import { createPropertySession } from "./property-session";

function read(generation: number): SourceRead {
	return {
		operation: { kind: "property", property: "color", scope: "" },
		handle: `read-${generation}`,
		owner: "owner",
		generation,
		source: "shared/button.tsx:1:1",
		role: "literal-attribute",
		field: "className",
		value: "text-red-500",
		original: {
			publication: "original",
			cell: "class",
			occurrence: "node",
			invocation: "call",
			value: "text-red-500",
			field: "className",
			context: "original",
		},
	};
}
it("retains one original read and commits only the last value once", async () => {
	const begin = vi.fn(async () => read(1));
	const preview = vi.fn(async () => true);
	const finish = vi.fn();
	const session = createPropertySession({ begin, plan: async () => undefined, preview, finish });
	session.begin("color", "");
	session.preview("color", "", { kind: "custom", value: "red" });
	session.preview("color", "", { kind: "custom", value: "blue" });
	await session.finish(true);
	await session.finish(true);
	expect(begin).toHaveBeenCalledTimes(1);
	expect(finish).toHaveBeenCalledExactlyOnceWith(read(1), { kind: "custom", value: "blue" }, true);
});
it("cancels a pending original read and never previews or commits into the next control", async () => {
	let resolveRead = (_read: SourceRead) => {};
	const pending = new Promise<SourceRead>((resolve) => {
		resolveRead = resolve;
	});
	const begin = vi.fn().mockReturnValueOnce(pending).mockResolvedValueOnce(read(2));
	const preview = vi.fn(async () => true);
	const finish = vi.fn();
	const session = createPropertySession({ begin, plan: async () => undefined, preview, finish });
	session.begin("color", "");
	session.preview("color", "", { kind: "custom", value: "blue" });
	session.begin("opacity", "");
	resolveRead(read(1));
	await session.finish(false);
	await Promise.resolve();
	expect(preview).not.toHaveBeenCalled();
	expect(finish.mock.calls).toEqual([
		[read(1), { kind: "custom", value: "blue" }, false],
		[read(2), undefined, false],
	]);
});

it("discards an older compiled preview and every reply after cancellation", async () => {
	const plans = new Map<number, (plan: import("../../source-property").SourcePropertyPreview) => void>();
	const preview = vi.fn(async () => true);
	const session = createPropertySession({
		begin: async () => read(1),
		plan: async (_read, revision) => new Promise((resolve) => plans.set(revision, resolve)),
		preview,
		finish: vi.fn(),
	});
	session.preview("color", "", { kind: "custom", value: "red" });
	await Promise.resolve();
	session.preview("color", "", { kind: "custom", value: "blue" });
	await Promise.resolve();
	const result = (revision: number) => ({ generation: 1, revision, value: "candidate", frames: [] });
	plans.get(1)!(result(1));
	await Promise.resolve();
	expect(preview).not.toHaveBeenCalled();
	await session.finish(false);
	plans.get(2)!(result(2));
	await Promise.resolve();
	expect(preview).not.toHaveBeenCalled();
});
