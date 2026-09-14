import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { BlockList, isIP } from "node:net";
import { MAX_OBJECT_BYTES } from "./manifest";

export interface FetchedResource {
	bytes: Uint8Array;
	mediaType: string;
	url: string;
}
export type ResourceFetcher = (url: string) => Promise<FetchedResource>;
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

export function publicResourceAddress(address: string, family: number): boolean {
	return !(family === 6 && /^::ffff:/i.test(address)) && !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

/** Resolve once, validate the address, and pin the actual TLS connection to it. */
export const fetchPublicResource: ResourceFetcher = async (initial) => {
	const controller = new AbortController();
	let timer: ReturnType<typeof setTimeout> | undefined;
	const deadline = new Promise<never>((_resolve, reject) => {
		timer = setTimeout(() => {
			controller.abort();
			reject(new Error("Resource download timed out."));
		}, 15000);
	});
	try {
		return await Promise.race([download(initial, controller.signal), deadline]);
	} finally {
		clearTimeout(timer);
		controller.abort();
	}
};
async function download(initial: string, signal: AbortSignal): Promise<FetchedResource> {
	let url = new URL(initial);
	for (let redirect = 0; redirect <= 4; redirect++) {
		if (
			url.protocol !== "https:" ||
			url.username !== "" ||
			url.password !== "" ||
			(url.port !== "" && url.port !== "443") ||
			url.hostname.toLowerCase() === "localhost" ||
			url.hostname.toLowerCase().endsWith(".localhost")
		)
			throw new Error(`Unsupported resource origin: ${url.origin}. Use a public HTTPS resource.`);
		const hostname = url.hostname.replace(/^\[|\]$/g, "");
		const addresses = isIP(hostname)
			? [{ address: hostname, family: isIP(hostname) }]
			: await lookup(hostname, { all: true });
		if (addresses.length === 0 || addresses.some(({ address, family }) => !publicResourceAddress(address, family)))
			throw new Error(`Resource ${url.origin} resolves to a private or reserved address.`);
		signal.throwIfAborted();
		const chosen = addresses[0];
		if (chosen === undefined) throw new Error("Resource DNS lookup returned no address.");
		const response = await new Promise<{ bytes: Uint8Array; mediaType: string; location?: string }>(
			(resolve, reject) => {
				const req = request(
					url,
					{
						method: "GET",
						signal,
						family: chosen.family,
						lookup: (_name, _options, callback) => callback(null, chosen.address, chosen.family),
						headers: {
							Accept: "*/*",
							"User-Agent": "Mozilla/5.0 AppleWebKit/537.36 Chrome/141.0.0.0 Safari/537.36",
						},
					},
					(res) => {
						if (
							(res.statusCode ?? 0) >= 300 &&
							(res.statusCode ?? 0) < 400 &&
							res.headers.location !== undefined
						) {
							res.destroy();
							resolve({ bytes: new Uint8Array(), mediaType: "", location: res.headers.location });
							return;
						}
						if (res.statusCode !== 200) {
							res.destroy();
							reject(new Error(`Resource ${url.origin}${url.pathname} returned HTTP ${res.statusCode}.`));
							return;
						}
						let length = 0;
						const chunks: Buffer[] = [];
						res.on("data", (chunk: Buffer) => {
							length += chunk.length;
							if (length > MAX_OBJECT_BYTES) {
								req.destroy(new Error("Resource exceeds the object size limit."));
								return;
							}
							chunks.push(chunk);
						});
						res.on("error", reject);
						res.on("end", () =>
							resolve({
								bytes: Buffer.concat(chunks),
								mediaType:
									(res.headers["content-type"] ?? "application/octet-stream").split(";")[0] ??
									"application/octet-stream",
							}),
						);
					},
				);
				req.setTimeout(15000, () => req.destroy(new Error("Resource download timed out.")));
				req.on("error", reject);
				req.end();
			},
		);
		if (response.location !== undefined) {
			url = new URL(response.location, url);
			continue;
		}
		return { ...response, url: url.href };
	}
	throw new Error("Resource redirected too many times.");
}
