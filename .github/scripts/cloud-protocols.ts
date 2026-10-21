import { execFileSync } from "node:child_process";
import { setTimeout } from "node:timers/promises";
import { pathToFileURL } from "node:url";

/** Where the deployed Spool Cloud says which sync protocols it accepts. */
export const PROTOCOLS_URL = "https://spool.page/sync/protocols";

/** `PROTOCOL_VERSION` as the release commit's sync protocol module declares it. */
export function declaredProtocol(source: string): number {
	const match = /^export const PROTOCOL_VERSION = (\d+);$/m.exec(source);
	if (!match) throw new Error("src/team-sync-protocol.ts declares no PROTOCOL_VERSION.");
	return Number(match[1]);
}

/** The one protocol every Spool Cloud deployed before it served its accepted protocols speaks. */
export const PROTOCOL_BEFORE_ROUTE = 2;

/** The cloud's answer when it doesn't serve its accepted protocols yet (it predates the route). */
export const NO_ROUTE = Symbol("no route");

/** Whether a release speaking `protocol` may publish, given what the cloud answered. */
export function protocolVerdict(protocol: number, answer: unknown): { ok: boolean; message: string } {
	if (answer === NO_ROUTE)
		return protocol === PROTOCOL_BEFORE_ROUTE
			? {
					ok: true,
					message: `${PROTOCOLS_URL} isn't served yet; a cloud from before it accepts protocol ${PROTOCOL_BEFORE_ROUTE}.`,
				}
			: {
					ok: false,
					message: `${PROTOCOLS_URL} isn't served yet, so the deployed Spool Cloud accepts only protocol ${PROTOCOL_BEFORE_ROUTE}, not ${protocol}. Deploy spool-cloud first, then rerun this release.`,
				};
	const accepted = (answer as { protocols?: unknown } | null)?.protocols;
	if (!Array.isArray(accepted) || !accepted.every((value) => Number.isSafeInteger(value)))
		return { ok: false, message: `${PROTOCOLS_URL} answered no list of protocols.` };
	if (!accepted.includes(protocol))
		return {
			ok: false,
			message: `The deployed Spool Cloud accepts protocols ${accepted.join(", ")}, not ${protocol}. Deploy spool-cloud first, then rerun this release.`,
		};
	return { ok: true, message: `The deployed Spool Cloud accepts protocol ${protocol}.` };
}

async function checkCloudProtocols(sha: string): Promise<void> {
	if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error("Expected a complete release commit SHA.");
	const protocol = declaredProtocol(
		execFileSync("git", ["show", `${sha}:src/team-sync-protocol.ts`], { encoding: "utf8" }),
	);
	const verdict = protocolVerdict(protocol, await readAccepted());
	console.log(verdict.message);
	if (!verdict.ok) throw new Error(verdict.message);
}

/** The cloud's answer, with two retries for a network blip. */
async function readAccepted(): Promise<unknown> {
	let failure = "";
	for (let attempt = 0; attempt < 3; attempt += 1) {
		if (attempt > 0) await setTimeout(5_000);
		try {
			const response = await fetch(PROTOCOLS_URL, { redirect: "manual", signal: AbortSignal.timeout(15_000) });
			if (response.ok) return await response.json();
			// a cloud from before the route sends /sync/protocols to sign-in, or doesn't know it
			if ((response.status >= 300 && response.status < 400) || response.status === 404) return NO_ROUTE;
			failure = `${PROTOCOLS_URL} returned HTTP ${response.status}.`;
		} catch (error) {
			failure = `${PROTOCOLS_URL} could not be read: ${error instanceof Error ? error.message : String(error)}`;
		}
	}
	throw new Error(failure);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
	await checkCloudProtocols(process.argv[2] ?? "");
}
