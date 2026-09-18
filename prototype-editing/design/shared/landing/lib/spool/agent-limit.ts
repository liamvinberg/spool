export type LimitStatus = "allowed" | "allowed_warning" | "rejected";

export type LimitWindow =
	| "five_hour"
	| "seven_day"
	| "seven_day_opus"
	| "seven_day_sonnet"
	| "seven_day_overage_included"
	| "overage";

export interface RateLimitInfo {
	readonly status: LimitStatus;
	readonly rateLimitType?: LimitWindow;
	readonly utilization?: number;
	/** unix seconds */
	readonly resetsAt?: number;
	readonly isUsingOverage: boolean;
	readonly surpassedThreshold?: number;
	readonly overageStatus?: string;
	readonly overageDisabledReason?: string;
	/**
	 * The wind-down. Parsed from `anthropic-ratelimit-unified-grace-status` and
	 * carried on the same object; never seen in a capture, because grace was never
	 * open during either session.
	 */
	readonly rateLimitGraceActive?: boolean;
}

export const LIMIT_SAYS: Readonly<Record<LimitWindow, string>> = {
	five_hour: "session limit",
	seven_day: "weekly limit",
	seven_day_opus: "Opus limit",
	seven_day_sonnet: "Sonnet limit",
	seven_day_overage_included: "Fable 5 limit",
	overage: "usage credit limit",
};

export function limitLabel(window: LimitWindow | undefined): string {
	if (window === undefined) return "usage limit";
	return LIMIT_SAYS[window] ?? window;
}

export function resetsIn(at: number | undefined, now: number): string | null {
	if (at === undefined) return null;
	const when = new Date(at * 1000);
	const away = at * 1000 - now;
	if (away <= 0) return "now";
	if (away < 24 * 3600 * 1000) return when.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
	return when.toLocaleDateString("en-GB", { weekday: "short" }).toLowerCase();
}

export function limitReadout(info: RateLimitInfo, now: number): string | null {
	if (info.status === "allowed") return null;
	const label = limitLabel(info.rateLimitType);
	const resets = resetsIn(info.resetsAt, now);
	const tail = resets === null ? "" : ` · resets ${resets}`;
	// "hit" is the binary's own verb for this state, and it is also the shortest
	// true one: the eighteen pixels are shared with the model, and at 420px the
	// rail has room for the fact or for a longer word about it, not both
	if (info.status === "rejected") return `${label} hit${tail}`;
	const used = info.utilization === undefined ? null : Math.floor(info.utilization * 100);
	if (used === null) return `approaching ${label}${tail}`;
	return `${label} ${used}%${tail}`;
}

export const WARNED: RateLimitInfo = {
	status: "allowed_warning",
	resetsAt: 1785308400,
	rateLimitType: "seven_day",
	utilization: 0.92,
	isUsingOverage: false,
	surpassedThreshold: 0.75,
};

export const REFUSED: RateLimitInfo = { ...WARNED, status: "rejected", utilization: 1 };

export const CAPTURED_NOW = Date.parse("2026-07-27T19:01:13.814Z");
