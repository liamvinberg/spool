import { describe, expect, it } from "vitest";
import { parseLinuxProcessBirth, parsePlatformProcessBirth } from "./machine-process-identity";

describe("machine process identity parsers", () => {
	it("parses Linux start ticks after the final process-name delimiter", () => {
		const stat = "42 (spool ) worker) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 123456";

		expect(parseLinuxProcessBirth(stat, "6fa459ea-ee8a-3ca4-894e-db77e160355e\n")).toBe(
			"linux:6fa459ea-ee8a-3ca4-894e-db77e160355e:123456",
		);
	});

	it("parses Windows UTC ticks without locale-dependent dates", () => {
		expect(parsePlatformProcessBirth("win32", "638890926150000000\r\n")).toBe("win32:638890926150000000");
	});

	it.each([
		["linux proc stat", () => parseLinuxProcessBirth("42 (spool) S 1 2", "boot-id")],
		[
			"Linux boot id",
			() => parseLinuxProcessBirth("42 (spool) S 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 123456", "\n"),
		],
		["Windows ticks", () => parsePlatformProcessBirth("win32", "Saturday, July 25")],
	] as const)("rejects malformed %s output", (_label, parse) => {
		expect(parse()).toBeUndefined();
	});
});
