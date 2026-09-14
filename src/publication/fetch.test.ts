import { lookup } from "node:dns/promises";
import { afterEach, expect, it, vi } from "vitest";
import { fetchPublicResource, publicResourceAddress } from "./fetch";

vi.mock("node:dns/promises", () => ({ lookup: vi.fn() }));
afterEach(() => vi.useRealTimers());
it("accepts public IPv4 and IPv6 while excluding private, reserved and mapped addresses", () => {
	for (const address of ["104.26.14.209", "8.8.8.8"]) expect(publicResourceAddress(address, 4)).toBe(true);
	expect(publicResourceAddress("2606:4700:20::ac43:46de", 6)).toBe(true);
	for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "100.64.0.1"])
		expect(publicResourceAddress(address, 4)).toBe(false);
	for (const address of ["::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1"])
		expect(publicResourceAddress(address, 6)).toBe(false);
});
it("bounds the entire operation even when DNS never resolves", async () => {
	vi.useFakeTimers();
	vi.mocked(lookup).mockImplementation(() => new Promise(() => {}));
	const result = expect(fetchPublicResource("https://cdn.example/test.js")).rejects.toThrow("timed out");
	await vi.advanceTimersByTimeAsync(15000);
	await result;
});
