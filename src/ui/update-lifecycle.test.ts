import { describe, expect, it } from "vitest";
import { beforeUpdate, prepareForUpdate, trackUpdateWrite } from "./update-lifecycle";

describe("saving before an update", () => {
	it("waits for both existing writes and writes started by a save hook", async () => {
		let finish!: (response: Response) => void;
		trackUpdateWrite(
			new Promise<Response>((resolve) => {
				finish = resolve;
			}),
		);
		let finishSave!: (response: Response) => void;
		const remove = beforeUpdate(async () => {
			trackUpdateWrite(
				new Promise<Response>((resolve) => {
					finishSave = resolve;
				}),
			);
		});
		let done = false;
		const saving = prepareForUpdate().then(() => {
			done = true;
		});
		finish(new Response());
		await Promise.resolve();
		expect(done).toBe(false);
		finishSave(new Response());
		await saving;
		expect(done).toBe(true);
		remove();
	});
	it("drains follow-up writes created while an earlier request finishes", async () => {
		let finish!: (response: Response) => void;
		const first = trackUpdateWrite(
			new Promise<Response>((resolve) => {
				finish = resolve;
			}),
		);
		let finishNext!: (response: Response) => void;
		void first.then(() =>
			trackUpdateWrite(
				new Promise<Response>((resolve) => {
					finishNext = resolve;
				}),
			),
		);
		let done = false;
		const saving = prepareForUpdate().then(() => {
			done = true;
		});
		await Promise.resolve();
		finish(new Response());
		await first;
		await Promise.resolve();
		expect(done).toBe(false);
		finishNext(new Response());
		await saving;
		expect(done).toBe(true);
	});

	it("refuses a failed write even when its caller does not await it", async () => {
		const remove = beforeUpdate(async () => {
			trackUpdateWrite(Promise.resolve(new Response(null, { status: 503 })));
			await Promise.resolve();
		});
		await expect(prepareForUpdate()).rejects.toThrow("could not be saved");
		remove();
		await expect(prepareForUpdate()).resolves.toBeUndefined();
	});
	it("checkpoints local drafts after the previous daemon has gone", async () => {
		let saved = false;
		const local = beforeUpdate(async () => {
			saved = true;
		}, true);
		const remote = beforeUpdate(async () => {
			throw new Error("old daemon");
		});
		await expect(prepareForUpdate(true)).resolves.toBeUndefined();
		expect(saved).toBe(true);
		local();
		remote();
	});
	it("does not hide a draft storage refusal", async () => {
		const remove = beforeUpdate(async () => {
			throw new Error("draft storage full");
		}, true);
		await expect(prepareForUpdate()).rejects.toThrow("draft storage full");
		remove();
	});
});
