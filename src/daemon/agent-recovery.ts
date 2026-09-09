import type { AgentRecovery } from "./agent-events";

/** Provider text stays inside the adapter. Only known, nonsecret facts leave it. */
export function providerRecovery(words: string, account: string, offer?: string): AgentRecovery | undefined {
	const login =
		// Google refuses a bad key as a 400 reading "API key not valid", never a 401.
		/\b401\b|unauthorized|authentication failed|invalid[ _]api[ _]key|api[ _]key[ _]invalid|api key not valid|not logged in|please run \/login|no authentication available|no api key found|token.*expired|invalid_grant/i.test(
			words,
		);
	const limited =
		/\b429\b|rate[ _-]?limit|usage_limit_reached|usage limit|resource_exhausted|insufficient_quota/i.test(words);
	if (!login && !limited) return undefined;
	let scope: AgentRecovery["scope"] = "unknown";
	let resetsAt: number | undefined;
	// Some pinned transports retain the provider JSON in errorMessage. Never forward it.
	try {
		const start = words.indexOf("{");
		const data = JSON.parse(words.slice(start));
		const error = data.error ?? data;
		if (error.scope === "account" || error.scope === "model") scope = error.scope;
		if (typeof error.resets_at === "number" && Number.isFinite(error.resets_at) && error.resets_at > 0)
			resetsAt = error.resets_at;
	} catch {
		/* Most SDK transports expose only a sentence, without scope or reset metadata. */
	}
	if (/usage_limit_reached|hit your ChatGPT usage limit/i.test(words)) scope = "account";
	return {
		kind: login ? "login" : "limit",
		account,
		scope: login ? "account" : scope,
		...(offer === undefined ? {} : { offer }),
		...(resetsAt === undefined ? {} : { resetsAt }),
	};
}

/** Retry-After is the provider's instruction for this refused request, not an estimate. */
export function retryAfterReset(value: string | null, now: number): number | undefined {
	if (!value?.trim()) return undefined;
	if (/^\d+(?:\.\d+)?$/.test(value.trim())) return now / 1000 + Number(value);
	const date = Date.parse(value);
	return Number.isFinite(date) ? date / 1000 : undefined;
}
