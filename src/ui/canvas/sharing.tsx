import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { type PlayerShareView, shareStyles, usePlayerShare } from "../../runtime/player-share";
import type { ShareChip } from "../../runtime/share-panel";
import { canvasPublicationClient, fetchSharedEntries, fetchSharingAvailable } from "../api";
import { attachHotkeyLayer } from "../hotkey-dispatch";

export interface FrameShareState {
	chip: ShareChip | undefined;
	/** the link is out there or on its way: the menu offers copy, sharing and stop */
	shared: boolean;
	open: boolean;
}

type Action = (share: PlayerShareView) => void;

export interface CanvasSharing {
	/** every sharing popover, one per frame that has a link or was just asked for one */
	node: ReactNode;
	state(entry: string): FrameShareState | undefined;
	/** a frame this machine remembers a link for, before its state has loaded */
	listed(entry: string): boolean;
	show(entry: string, view?: "stop"): void;
	/** copy the frame's link, making it first when there is none */
	copy(entry: string): void;
}

/**
 * Sharing on the canvas: the link belongs to the frame. Every frame this
 * machine has a link for gets a controller of its own, so its label can say
 * what the link is doing at any zoom, and a frame asked for its first link
 * joins them. Each controller owns one popover, anchored to its frame's label.
 */
export function useCanvasSharing(project: string, available: boolean): CanvasSharing {
	const [listedEntries, setListedEntries] = useState<string[]>([]);
	const [requested, setRequested] = useState<string[]>([]);
	const [states, setStates] = useState<Record<string, FrameShareState>>({});
	const handles = useRef(new Map<string, PlayerShareView>());
	const queued = useRef(new Map<string, Action[]>());

	useEffect(() => {
		if (!available) {
			setListedEntries([]);
			setRequested([]);
			setStates({});
			return;
		}
		let revision = 0;
		const refresh = () => {
			const request = ++revision;
			void fetchSharedEntries(project).then((next) => {
				if (request === revision)
					setListedEntries((current) => (current.join("\0") === next.join("\0") ? current : next));
			});
		};
		const foreground = () => {
			if (document.visibilityState === "visible") refresh();
		};
		refresh();
		window.addEventListener("focus", refresh);
		window.addEventListener("spool-player-publication-change", refresh);
		document.addEventListener("visibilitychange", foreground);
		return () => {
			revision++;
			window.removeEventListener("focus", refresh);
			window.removeEventListener("spool-player-publication-change", refresh);
			document.removeEventListener("visibilitychange", foreground);
		};
	}, [project, available]);

	const entries = useMemo(() => [...new Set([...listedEntries, ...requested])], [listedEntries, requested]);

	const act = useCallback((entry: string, action: Action) => {
		const handle = handles.current.get(entry);
		if (handle !== undefined) {
			action(handle);
			return;
		}
		queued.current.set(entry, [...(queued.current.get(entry) ?? []), action]);
		setRequested((current) => (current.includes(entry) ? current : [...current, entry]));
	}, []);

	const register = useCallback((entry: string, handle: PlayerShareView | undefined) => {
		if (handle === undefined) {
			handles.current.delete(entry);
			return;
		}
		handles.current.set(entry, handle);
		const waiting = queued.current.get(entry);
		if (waiting === undefined) return;
		queued.current.delete(entry);
		for (const action of waiting) action(handle);
	}, []);

	const report = useCallback((entry: string, state: FrameShareState | undefined) => {
		setStates((current) => {
			const previous = current[entry];
			if (
				previous?.shared === state?.shared &&
				previous?.open === state?.open &&
				JSON.stringify(previous?.chip) === JSON.stringify(state?.chip)
			)
				return current;
			const next = { ...current };
			if (state === undefined) delete next[entry];
			else next[entry] = state;
			return next;
		});
	}, []);

	return {
		node: available ? (
			<>
				<style>{shareStyles}</style>
				{entries.map((entry) => (
					<FrameShare key={entry} project={project} entry={entry} onHandle={register} onState={report} />
				))}
			</>
		) : null,
		state: (entry) => states[entry],
		listed: (entry) => listedEntries.includes(entry),
		show: (entry, view) => act(entry, (share) => share.show(view)),
		copy: (entry) => act(entry, (share) => share.copyShare()),
	};
}

function FrameShare({
	project,
	entry,
	onHandle,
	onState,
}: {
	project: string;
	entry: string;
	onHandle: (entry: string, handle: PlayerShareView | undefined) => void;
	onState: (entry: string, state: FrameShareState | undefined) => void;
}) {
	const client = useMemo(() => canvasPublicationClient(project, entry), [project, entry]);
	const share = usePlayerShare(client, {
		anchor: () => document.querySelector(`[data-frame-label="${CSS.escape(entry)}"]`),
		placement: "beside",
	});
	// the canvas holds one handle for the frame's whole life, so it forwards to the latest render's verbs
	const latest = useRef(share);
	latest.current = share;
	useEffect(() => {
		onHandle(entry, {
			get chip() {
				return latest.current.chip;
			},
			get shared() {
				return latest.current.shared;
			},
			get available() {
				return latest.current.available;
			},
			get connected() {
				return latest.current.connected;
			},
			get open() {
				return latest.current.open;
			},
			get trigger() {
				return latest.current.trigger;
			},
			get surface() {
				return latest.current.surface;
			},
			show: (view) => latest.current.show(view),
			close: () => latest.current.close(),
			copyShare: () => latest.current.copyShare(),
		});
		return () => {
			onHandle(entry, undefined);
			onState(entry, undefined);
		};
	}, [entry, onHandle, onState]);
	const { chip, shared, open } = share;
	useEffect(() => {
		onState(entry, { chip, shared, open });
	}, [entry, chip, shared, open, onState]);
	// typing an address never reaches the canvas's own keys
	useEffect(() => {
		if (!open) return;
		return attachHotkeyLayer({ scope: "dialog", handlers: {} });
	}, [open]);
	return share.surface;
}

export function useSharingAvailable(): boolean {
	const [available, setAvailable] = useState(false);
	useEffect(() => {
		let revision = 0;
		const refresh = () => {
			const request = ++revision;
			void fetchSharingAvailable().then((next) => {
				if (request === revision) setAvailable(next);
			});
		};
		const foreground = () => {
			if (document.visibilityState === "visible") refresh();
		};
		refresh();
		window.addEventListener("focus", refresh);
		document.addEventListener("visibilitychange", foreground);
		return () => {
			revision++;
			window.removeEventListener("focus", refresh);
			document.removeEventListener("visibilitychange", foreground);
		};
	}, []);
	return available;
}
