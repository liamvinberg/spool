import { lookup as dnsLookup } from "node:dns";
import { lookup as resolveHost } from "node:dns/promises";
import { isIP, type LookupFunction } from "node:net";
import { Agent } from "undici";
import { publicResourceAddress } from "./public-address";

/**
 * The daemon's one way onto the public web for a file somebody else named: a foundry's stylesheet in fonts.css
 * (#80), a site's stylesheets, images and fonts in a reference (spool#241). Https-only and public-only (DEV-175):
 * it runs from Node, past every policy a browser keeps, on URLs a teammate or a website wrote, so a URL that is not
 * https, or whose host resolves to a loopback, link-local, private or unique-local address, is refused, and so is
 * every redirect that leads to one.
 */

export type HostLookup = (hostname: string) => Promise<{ address: string; family: number }[]>;

/** How many redirects one fetch follows, every hop checked like the first. */
const MAX_REDIRECTS = 4;

/** Why a URL may not be fetched, or nothing when it may. */
export async function refusal(url: URL, lookup: HostLookup): Promise<string | undefined> {
	if (url.protocol !== "https:") return "not https";
	const hostname = url.hostname.replace(/^\[|\]$/g, "");
	const family = isIP(hostname);
	// A host that does not resolve is the network's failure, not a refusal: the fetch reports it.
	const addresses = family === 0 ? await lookup(hostname).catch(() => []) : [{ address: hostname, family }];
	const local = addresses.find(({ address, family }) => !publicResourceAddress(address, family));
	return local === undefined ? undefined : `${hostname} resolves to the local address ${local.address}`;
}

/**
 * Node's own fetch, with the connection held to the same rule: a host that
 * resolved to a public address for the check and to a local one for the
 * connect (a rebinding DNS answer) is refused at the socket.
 */
export function publicFetch(): typeof globalThis.fetch {
	const lookup: LookupFunction = (hostname, options, callback) => {
		dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
			if (error !== null) return callback(error, []);
			const local = addresses.find((entry) => !publicResourceAddress(entry.address, entry.family));
			if (local !== undefined)
				return callback(new Error(`${hostname} resolves to the local address ${local.address}`), []);
			if (options.all === true) return callback(null, addresses);
			const [first] = addresses;
			if (first === undefined) return callback(new Error(`${hostname} did not resolve`), []);
			callback(null, first.address, first.family);
		});
	};
	const dispatcher = new Agent({ connect: { lookup } });
	return (input, init) => fetch(input, { ...init, dispatcher } as RequestInit);
}

export const lookupHost: HostLookup = (hostname) => resolveHost(hostname, { all: true });

/** What one guarded fetch brought back: the bytes, where they finally came from, and what they said they were. */
export interface PublicFile {
	bytes: Buffer;
	url: string;
	type: string | undefined;
}

export interface PublicGetOptions {
	fetch: typeof globalThis.fetch;
	lookup: HostLookup;
	signal: AbortSignal;
	headers?: Record<string, string>;
	/** The most bytes to take: a larger answer is dropped, unread past the limit. */
	maxBytes?: number;
	/** Hears each refusal, with the hop that was refused. */
	refused?: (url: string, hop: string, reason: string) => void;
}

/** One file off the public web, every redirect checked as the first hop was; nothing for a refusal or a failure. */
export async function publicGet(url: string, options: PublicGetOptions): Promise<PublicFile | undefined> {
	try {
		let hop = new URL(url);
		for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
			const reason = await refusal(hop, options.lookup);
			if (reason !== undefined) {
				options.refused?.(url, hop.href, reason);
				return undefined;
			}
			const response = await options.fetch(hop, {
				...(options.headers === undefined ? {} : { headers: options.headers }),
				redirect: "manual",
				signal: options.signal,
			});
			const location = response.headers.get("location");
			if (response.status >= 300 && response.status < 400 && location !== null) {
				await response.body?.cancel().catch(() => {});
				hop = new URL(location, hop);
				continue;
			}
			if (!response.ok) {
				await response.body?.cancel().catch(() => {});
				return undefined;
			}
			const bytes = await readCapped(response, options.maxBytes);
			if (bytes === undefined) return undefined;
			return { bytes, url: hop.href, type: response.headers.get("content-type") ?? undefined };
		}
		return undefined;
	} catch {
		return undefined;
	}
}

async function readCapped(response: Response, maxBytes: number | undefined): Promise<Buffer | undefined> {
	if (maxBytes === undefined) return Buffer.from(await response.arrayBuffer());
	const declared = Number(response.headers.get("content-length"));
	if (Number.isFinite(declared) && declared > maxBytes) {
		await response.body?.cancel().catch(() => {});
		return undefined;
	}
	if (response.body === null) return Buffer.alloc(0);
	const reader = response.body.getReader();
	const chunks: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { done, value } = await reader.read();
		if (done) return Buffer.concat(chunks);
		size += value.byteLength;
		if (size > maxBytes) {
			await reader.cancel().catch(() => {});
			return undefined;
		}
		chunks.push(value);
	}
}
