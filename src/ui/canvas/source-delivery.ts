import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import type { SourceOccurrence, SourcePublication, UseOutcome } from "../../source-edit";
import { respondSourceObservation, subscribeSse } from "../api";

/** Calls belong to the original iframe WindowProxy, never just a frame name. */
export function useSourceDelivery(project: string, iframes: RefObject<Map<string, HTMLIFrameElement>>) {
	const observer = useRef(crypto.randomUUID());
	const pending = useRef(
		new Map<string, { window: Window; resolve: (value: unknown) => void; timer: ReturnType<typeof setTimeout> }>(),
	);
	useEffect(() => {
		const waiting = pending.current;
		const listener = (event: MessageEvent) => {
			const data: unknown = event.data;
			if (
				typeof data !== "object" ||
				data === null ||
				!("spool" in data) ||
				data.spool !== "source-reply" ||
				!("id" in data) ||
				typeof data.id !== "string"
			)
				return;
			const call = waiting.get(data.id);
			if (!call || event.source !== call.window) return;
			waiting.delete(data.id);
			clearTimeout(call.timer);
			call.resolve("result" in data ? data.result : undefined);
		};
		addEventListener("message", listener);
		return () => {
			removeEventListener("message", listener);
			for (const call of waiting.values()) {
				clearTimeout(call.timer);
				call.resolve(undefined);
			}
			waiting.clear();
		};
	}, []);
	const request = useCallback(
		<T>(frame: string, message: Record<string, unknown>): Promise<T | undefined> => {
			const window = iframes.current.get(frame)?.contentWindow;
			if (!window) return Promise.resolve(undefined);
			return new Promise((resolve) => {
				const id = crypto.randomUUID();
				const timer = setTimeout(() => {
					pending.current.delete(id);
					resolve(undefined);
				}, 4000);
				pending.current.set(id, { window, timer, resolve: (value) => resolve(value as T | undefined) });
				window.postMessage({ spool: "source-request", id, ...message }, "*");
			});
		},
		[iframes],
	);
	useEffect(
		() =>
			subscribeSse(`/api/p/${encodeURIComponent(project)}/source-observer/${observer.current}`, {
				observe: (data) => {
					const challenge = data as { id: string; frame: string; generation: number };
					void request<SourceOccurrence>(challenge.frame, {
						action: "complete",
						generation: challenge.generation,
					}).then((original) => respondSourceObservation(project, observer.current, challenge.id, original));
				},
			}),
		[project, request],
	);
	return {
		observer: observer.current,
		revoke: useCallback(
			(publication: SourcePublication) => request<boolean>(publication.frame, { action: "revoke", publication }),
			[request],
		),
		read: useCallback(
			(frame: string, selector: string, generation: number) =>
				request<SourceOccurrence>(frame, { action: "read", selector, generation }),
			[request],
		),
		install: useCallback(
			async (publication: SourcePublication, undo = false) => {
				const result = await request<UseOutcome>(publication.frame, { action: "install", publication, undo });
				// Revoke in the runtime before the canvas releases the source owner's
				// hold. A delayed install message cannot outlive a timed-out request.
				if (!result) await request<boolean>(publication.frame, { action: "revoke", publication });
				return result;
			},
			[request],
		),
		preview: useCallback(
			(frame: string, generation: number, text: string) =>
				request<boolean>(frame, { action: "preview", generation, text }),
			[request],
		),
		cancel: useCallback(
			(frame: string, generation: number) => request<void>(frame, { action: "cancel", generation }),
			[request],
		),
		complete: useCallback(
			(frame: string, generation: number) => request<SourceOccurrence>(frame, { action: "complete", generation }),
			[request],
		),
	};
}
