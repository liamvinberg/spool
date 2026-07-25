import { expect, it } from "vitest";
import { CheckerAliasAllocator, checkerAliasCapacity } from "./check-alias";
import { CheckSourceLimitError, checkSourceLimits } from "./check-budget";

it("allocates distinct one-code-unit names past the old wrap across every checker consumer", () => {
	const allocator = new CheckerAliasAllocator();
	const aliases = Array.from({ length: 4_097 }, (_, index) => allocator.allocate("module", `module-${index}.ts`, 1));
	aliases.push(
		allocator.allocate("jsx", "frame.tsx", 1),
		allocator.allocate("ambient", "globals.d.ts", 1, "identifier"),
	);

	expect(new Set(aliases).size).toBe(4_099);
	expect(aliases).not.toContain("\ue000");
});

it("fails closed before the resource budget can exceed the injective alias alphabet", () => {
	expect(checkSourceLimits.maxAliases).toBeLessThanOrEqual(checkerAliasCapacity);
	const allocator = new CheckerAliasAllocator(3);
	allocator.allocate("module", "first.ts", 1);
	allocator.allocate("jsx", "second.tsx", 1);
	allocator.allocate("ambient", "third.d.ts", 1);

	expect(() => allocator.allocate("module", "overflow.ts", 1)).toThrow(CheckSourceLimitError);
	try {
		allocator.allocate("module", "overflow.ts", 1);
	} catch (error) {
		expect((error as CheckSourceLimitError).file).toBe("overflow.ts");
	}
	expect(() => new CheckerAliasAllocator(checkerAliasCapacity + 1)).toThrow(
		"checker alias budget exceeds its injective alphabet",
	);
});

it("skips module and identifier names already present in authored input", () => {
	const allocator = new CheckerAliasAllocator();
	allocator.reserve("module", "\ue001");
	allocator.reserve("identifier", "一一一一一一一");

	expect(allocator.allocate("module", "frame.tsx", 1)).not.toBe("\ue001");
	expect(allocator.allocate("require", "frame.tsx", 7, "identifier")).not.toBe("一一一一一一一");
});

it("fails closed when authored input occupies every safe same-length module name", () => {
	const allocator = new CheckerAliasAllocator();
	const occupied = Array.from({ length: checkerAliasCapacity }, (_, index) =>
		String.fromCharCode(0xe001 + index),
	).join("");
	allocator.reserve("module", occupied);

	expect(() => allocator.allocate("module", "frame.tsx", 1)).toThrow(CheckSourceLimitError);
});
