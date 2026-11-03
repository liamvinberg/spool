import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { startProject } from "./api";
import { Toast } from "./primitives/feedback";

const REFUSED_TOAST_MS = 6000;

/**
 * New project, asking nothing: one press makes the next `untitled` (in a team, with `team`) and hands it to
 * `onStarted` to open. A second press while one is on its way makes nothing more. What a refusal says stands
 * in a toast at the window's foot.
 */
export function useStartProject(onStarted: (project: { root: string; name: string }) => void): {
	start: (team?: string) => void;
	toast: ReactNode;
} {
	const starting = useRef(false);
	const [refused, setRefused] = useState<string | null>(null);
	const latest = useRef(onStarted);
	latest.current = onStarted;
	const start = useCallback((team?: string) => {
		if (starting.current) return;
		starting.current = true;
		setRefused(null);
		void startProject(team)
			.then((outcome) => {
				if (outcome.kind === "opened") latest.current({ root: outcome.root, name: outcome.name });
				else setRefused(outcome.message);
			})
			.finally(() => {
				starting.current = false;
			});
	}, []);
	const dismiss = useCallback(() => setRefused(null), []);
	return { start, toast: refused !== null && <RefusedToast key={refused} message={refused} onDismiss={dismiss} /> };
}

function RefusedToast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
	useEffect(() => {
		const timer = setTimeout(onDismiss, REFUSED_TOAST_MS);
		return () => clearTimeout(timer);
	}, [onDismiss]);
	return (
		<div className="-translate-x-1/2 fixed bottom-6 left-1/2 z-20">
			<Toast tone="error" message={message} drain={REFUSED_TOAST_MS} onDismiss={onDismiss} />
		</div>
	);
}
