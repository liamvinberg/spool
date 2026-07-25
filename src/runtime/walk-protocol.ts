export type WalkDecision =
	| { spool: "walk-decision"; frame: string; id: number; accepted: true }
	| {
			spool: "walk-decision";
			frame: string;
			id: number;
			accepted: false;
			reason: "inactive" | "missing";
	  };

export function parseWalkDecision(value: unknown): WalkDecision | undefined {
	if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
	const message = value as Record<string, unknown>;
	if (message.spool !== "walk-decision" || typeof message.frame !== "string") return undefined;
	if (message.accepted === true) {
		return hasExactKeys(message, ["spool", "frame", "id", "accepted"]) && isWalkId(message.id)
			? (message as unknown as WalkDecision)
			: undefined;
	}
	if (message.accepted !== false || !hasExactKeys(message, ["spool", "frame", "id", "accepted", "reason"])) {
		return undefined;
	}
	return isWalkId(message.id) && (message.reason === "inactive" || message.reason === "missing")
		? (message as unknown as WalkDecision)
		: undefined;
}

export function walkAccepted(frame: string, id: number): WalkDecision {
	return { spool: "walk-decision", frame, id, accepted: true };
}

export function walkRejected(frame: string, id: number, reason: "inactive" | "missing"): WalkDecision {
	return { spool: "walk-decision", frame, id, accepted: false, reason };
}

export function isWalkId(value: unknown): value is number {
	return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
	const own = Object.keys(value);
	return own.length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}
