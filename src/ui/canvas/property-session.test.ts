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
	const session = createPropertySession({
		begin,
		plan: async () => ({ ok: false, reason: "unused" }),
		refused: vi.fn(),
		preview,
		finish,
	});
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
	const session = createPropertySession({
		begin,
		plan: async () => ({ ok: false, reason: "unused" }),
		refused: vi.fn(),
		preview,
		finish,
	});
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
	const plans = new Map<number, (plan: import("./property-session").PropertyPlanResult) => void>();
	const preview = vi.fn(async () => true);
	const session = createPropertySession({
		begin: async () => read(1),
		plan: async (_read, revision) => new Promise((resolve) => plans.set(revision, resolve)),
		preview,
		refused: vi.fn(),
		finish: vi.fn(),
	});
	session.preview("color", "", { kind: "custom", value: "red" });
	await Promise.resolve();
	session.preview("color", "", { kind: "custom", value: "blue" });
	await Promise.resolve();
	const result = (revision: number) => ({ generation: 1, revision, value: "candidate", frames: [] });
	plans.get(1)!({ ok: true, preview: result(1) });
	await Promise.resolve();
	expect(preview).not.toHaveBeenCalled();
	await session.finish(false);
	plans.get(2)!({ ok: true, preview: result(2) });
	await Promise.resolve();
	expect(preview).not.toHaveBeenCalled();
});

it("ignores a held preview refusal after a newer success or cancellation", async () => {
	const plans = new Map<number, (result: import("./property-session").PropertyPlanResult) => void>();
	const refused = vi.fn();
	const preview = vi.fn(async () => true);
	const session = createPropertySession({
		begin: async () => read(1),
		plan: async (_read, revision) => new Promise((resolve) => plans.set(revision, resolve)),
		preview,
		refused,
		finish: vi.fn(),
	});
	session.preview("color", "", { kind: "custom", value: "old" });
	await Promise.resolve();
	session.preview("color", "", { kind: "custom", value: "new" });
	await Promise.resolve();
	const accepted = { generation: 1, revision: 2, value: "new", frames: [] };
	plans.get(2)!({ ok: true, preview: accepted });
	await Promise.resolve();
	plans.get(1)!({ ok: false, reason: "old failure" });
	await Promise.resolve();
	await vi.waitFor(() => expect(preview).toHaveBeenCalledExactlyOnceWith(accepted));
	expect(refused).not.toHaveBeenCalled();
	session.preview("color", "", { kind: "custom", value: "cancelled" });
	await Promise.resolve();
	await session.finish(false);
	plans.get(3)!({ ok: false, reason: "cancelled failure" });
	await Promise.resolve();
	expect(refused).not.toHaveBeenCalled();
});

it("reports only the current preview refusal with its original read and requested value", async () => {
	const refused = vi.fn();
	const session = createPropertySession({
		begin: async () => read(1),
		plan: async () => ({ ok: false, reason: "unsupported effect" }),
		preview: vi.fn(async () => true),
		refused,
		finish: vi.fn(),
	});
	const value = { kind: "custom", value: "requested" } as const;
	session.preview("color", "", value);
	await Promise.resolve();
	await Promise.resolve();
	expect(refused).toHaveBeenCalledExactlyOnceWith(read(1), value, "unsupported effect");
});

it("retains the latest requested value while the original read is pending and aborts it synchronously", async () => {
	let request: import("./property-session").PropertyReadRequest | undefined;
	let resolveRead = (_read: SourceRead | undefined) => {};
	const finish = vi.fn();
	const session = createPropertySession({
		begin: (_property, _scope, reading) => {
			request = reading;
			return new Promise((resolve) => {
				resolveRead = resolve;
			});
		},
		plan: async () => ({ ok: false, reason: "unused" }),
		preview: vi.fn(async () => true),
		refused: vi.fn(),
		finish,
	});
	session.preview("color", "", { kind: "custom", value: "first" });
	session.preview("color", "", { kind: "custom", value: "requested" });
	expect(request?.value()).toEqual({ kind: "custom", value: "requested" });
	const cancelled = session.finish(false);
	expect(request?.signal.aborted).toBe(true);
	resolveRead(undefined);
	await cancelled;
	expect(finish).not.toHaveBeenCalled();
});

it("cancels completion if the control retires before its original read arrives", async () => {
	let resolveRead = (_read: SourceRead) => {};
	const finish = vi.fn();
	const session = createPropertySession({
		begin: () =>
			new Promise((resolve) => {
				resolveRead = resolve;
			}),
		plan: async () => ({ ok: false, reason: "unused" }),
		preview: vi.fn(async () => true),
		refused: vi.fn(),
		finish,
	});
	const completing = session.apply("opacity", "", { kind: "custom", value: "50" });
	await session.finish(false);
	resolveRead(read(1));
	await completing;
	expect(finish).toHaveBeenCalledExactlyOnceWith(read(1), { kind: "custom", value: "50" }, false);
});
