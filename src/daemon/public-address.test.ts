import { expect, it } from "vitest";
import { publicResourceAddress } from "./public-address";

it("accepts public IPv4 and IPv6 while excluding private, reserved and mapped addresses", () => {
	for (const address of ["104.26.14.209", "8.8.8.8"]) expect(publicResourceAddress(address, 4)).toBe(true);
	expect(publicResourceAddress("2606:4700:20::ac43:46de", 6)).toBe(true);
	for (const address of ["127.0.0.1", "10.0.0.1", "169.254.169.254", "192.168.1.1", "100.64.0.1"])
		expect(publicResourceAddress(address, 4)).toBe(false);
	for (const address of ["::1", "::ffff:127.0.0.1", "fc00::1", "fe80::1"])
		expect(publicResourceAddress(address, 6)).toBe(false);
});
