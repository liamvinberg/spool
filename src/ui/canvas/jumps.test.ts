import { describe, expect, it } from "vitest";
import { emptyJumps, JUMP_LIMIT, type JumpEntry, recordJump, takeBack, takeForward } from "./jumps";

const at = (page: string, x: number, y = 0, k = 1): JumpEntry => ({ page, camera: { x, y, k } });
const pages = (...names: string[]) => new Set(["", ...names]);

describe("recordJump", () => {
	it("pushes the departure and voids forward", () => {
		let jumps = recordJump(emptyJumps(), at("", 0));
		const taken = takeBack(jumps, at("", 500), pages());
		jumps = recordJump(taken?.jumps ?? jumps, at("", 0));
		expect(jumps.back).toHaveLength(1);
		expect(jumps.forward).toHaveLength(0);
	});

	it("skips a departure that repeats the top, but still voids forward", () => {
		let jumps = recordJump(emptyJumps(), at("", 0));
		const taken = takeBack(jumps, at("", 500), pages());
		// back at the recorded spot with a forward future: jumping afresh from
		// the same spot adds nothing — and still burns the future
		jumps = recordJump(taken?.jumps ?? jumps, at("", 0.4));
		expect(jumps.back).toHaveLength(1);
		expect(jumps.forward).toHaveLength(0);
	});

	it("caps the stack at JUMP_LIMIT, oldest first", () => {
		let jumps = emptyJumps();
		for (let i = 0; i <= JUMP_LIMIT + 4; i++) jumps = recordJump(jumps, at("", i * 10));
		expect(jumps.back).toHaveLength(JUMP_LIMIT);
		expect(jumps.back[0]?.camera.x).toBe(50);
	});
});

describe("takeBack and takeForward", () => {
	it("round-trips: back lands on the departure, forward returns", () => {
		const jumps = recordJump(emptyJumps(), at("", 0));
		const back = takeBack(jumps, at("checkout", 900), pages("checkout"));
		expect(back?.entry).toEqual(at("", 0));
		expect(back?.jumps.back).toHaveLength(0);
		const forward = takeForward(back?.jumps ?? jumps, at("", 0), pages("checkout"));
		expect(forward?.entry).toEqual(at("checkout", 900));
		expect(forward?.jumps.back).toHaveLength(1);
		expect(forward?.jumps.forward).toHaveLength(0);
	});

	it("skips a departure on a deleted page and serves the older one", () => {
		let jumps = recordJump(emptyJumps(), at("", 0));
		jumps = recordJump(jumps, at("checkout", 300));
		const taken = takeBack(jumps, at("", 900), pages());
		expect(taken?.entry).toEqual(at("", 0));
		// the dead departure is gone for good — forward holds only the present
		expect(taken?.jumps.back).toHaveLength(0);
		expect(taken?.jumps.forward).toHaveLength(1);
	});

	it("skips the spot already underfoot and reaches the one before it", () => {
		let jumps = recordJump(emptyJumps(), at("", 0));
		jumps = recordJump(jumps, at("", 700));
		const taken = takeBack(jumps, at("", 700.3), pages());
		expect(taken?.entry).toEqual(at("", 0));
	});

	it("is undefined on an empty stack", () => {
		expect(takeBack(emptyJumps(), at("", 0), pages())).toBeUndefined();
		expect(takeForward(emptyJumps(), at("", 0), pages())).toBeUndefined();
	});

	it("is undefined when the only departure is the spot underfoot, and keeps it", () => {
		const jumps = recordJump(emptyJumps(), at("", 0));
		expect(takeBack(jumps, at("", 0), pages())).toBeUndefined();
		expect(jumps.back).toHaveLength(1);
	});
});
