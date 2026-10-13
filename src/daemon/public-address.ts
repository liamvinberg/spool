import { BlockList } from "node:net";

const blocked = new BlockList();
for (const [address, prefix] of [
	["0.0.0.0", 8],
	["10.0.0.0", 8],
	["100.64.0.0", 10],
	["127.0.0.0", 8],
	["169.254.0.0", 16],
	["172.16.0.0", 12],
	["192.0.0.0", 24],
	["192.0.2.0", 24],
	["192.168.0.0", 16],
	["198.18.0.0", 15],
	["198.51.100.0", 24],
	["203.0.113.0", 24],
	["224.0.0.0", 4],
	["240.0.0.0", 4],
] as const)
	blocked.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [
	["::", 96],
	["fc00::", 7],
	["fe80::", 10],
	["ff00::", 8],
	["2001:db8::", 32],
] as const)
	blocked.addSubnet(address, prefix, "ipv6");
blocked.addAddress("::1", "ipv6");

/** Whether a resolved address is on the public internet: not loopback, private, link-local, reserved or IPv4-mapped. */
export function publicResourceAddress(address: string, family: number): boolean {
	return !(family === 6 && /^::ffff:/i.test(address)) && !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}
