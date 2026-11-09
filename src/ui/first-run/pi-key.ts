import { useRef, useState } from "react";
import type { PiKeyResult } from "../../daemon/agent-setup";
import { PI_KEY_PROVIDERS, type PiKeyProvider } from "../../daemon/pi-providers";
import { postPiKey } from "../api";

/** The key on pi's page, and what became of it: `unsure` is a key spool couldn't check that would replace pi's. */
export interface PiKeyState {
	provider: PiKeyProvider;
	key: string;
	check: "idle" | "checking" | "ok" | "bad" | "unsure";
	said: string;
}

/** What the key's line says once the daemon has answered. */
function keySaid(result: PiKeyResult, provider: PiKeyProvider): Pick<PiKeyState, "check" | "said"> {
	const name = PI_KEY_PROVIDERS.find((one) => one.id === provider)?.name ?? provider;
	if (!result.ok) return { check: result.unchecked === true ? "unsure" : "bad", said: result.reason };
	const took = result.checked
		? result.models > 0
			? `${name} took it: ${result.models} models in pi.`
			: `${name} took it, and pi has it.`
		: `Saved to pi unchecked: spool couldn’t reach ${name}.`;
	return { check: "ok", said: result.replaced ? `${took} It replaced the one pi had.` : took };
}

/**
 * pi's key field (spool#250): the provider, the key typed, and its check. A check answers
 * only for what was typed when it started: a key or provider changed while it runs makes
 * the field new again, and that check's answer is let go when it comes.
 */
export function usePiKey() {
	const [state, setState] = useState<PiKeyState>({ provider: "anthropic", key: "", check: "idle", said: "" });
	const latest = useRef(state);
	latest.current = state;
	/** the check whose answer the field still waits for */
	const asked = useRef(0);
	const edit = (next: Partial<Pick<PiKeyState, "provider" | "key">>) => {
		asked.current += 1;
		setState((was) => ({ ...was, ...next, check: "idle", said: "" }));
	};
	return {
		state,
		setProvider: (provider: PiKeyProvider) => {
			if (latest.current.provider !== provider) edit({ provider, key: "" });
		},
		setKey: (key: string) => edit({ key }),
		/** check the key with its provider and save it; `unsure` saves it unchecked, as asked */
		check: () => {
			const { provider, key, check } = latest.current;
			if (key.trim() === "" || check === "checking") return;
			asked.current += 1;
			const mine = asked.current;
			setState((was) => ({ ...was, check: "checking" }));
			void postPiKey(provider, key, { unchecked: check === "unsure" }).then((result) => {
				if (asked.current === mine) setState((was) => ({ ...was, ...keySaid(result, provider) }));
			});
		},
	};
}
