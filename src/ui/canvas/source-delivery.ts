import type { RefObject } from "react";
import { useCallback, useEffect, useRef } from "react";
import {
	combineUseOutcomes,
	type SourceInventory,
	type SourceOccurrence,
	type SourcePublication,
	type SourceRead,
	type SourceUse,
	type UseOutcome,
} from "../../source-edit";
import { describeSource, respondSourceObservation, sourceReach, subscribeSse } from "../api";
import type { PickedHit } from "./protocol";

/** Calls belong to the original iframe WindowProxy, never just a frame name. */
export function useSourceDelivery(project: string, iframes: RefObject<Map<string, HTMLIFrameElement>>) {
	const observer = useRef(crypto.randomUUID());
	const prepared = useRef(new Map<number, { initiator: string; frames: string[] }>());
	const pending = useRef(
		new Map<string, { window: Window; resolve: (value: unknown) => void; timer: ReturnType<typeof setTimeout> }>(),
	);
	useEffect(() => {
		const waiting = pending.current;
		const listener = (event: MessageEvent) => {
			const data: unknown = event.data;
			if (
				typeof data === "object" &&
				data !== null &&
				"spool" in data &&
				data.spool === "source-preview" &&
				"generation" in data &&
				typeof data.generation === "number" &&
				"frame" in data &&
				typeof data.frame === "string" &&
				"text" in data &&
				typeof data.text === "string"
			) {
				const held = prepared.current.get(data.generation);
				if (held?.initiator !== data.frame || event.source !== iframes.current.get(data.frame)?.contentWindow)
					return;
				for (const frame of held.frames)
					iframes.current.get(frame)?.contentWindow?.postMessage(
						{
							spool: "source-request",
							id: crypto.randomUUID(),
							action: "preview",
							generation: data.generation,
							text: data.text,
						},
						"*",
					);
				return;
			}
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
	}, [iframes]);
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
	const inventory = useCallback(
		async (field?: string): Promise<SourceInventory[]> => {
			return await Promise.all(
				[...iframes.current].map(async ([name, iframe]): Promise<SourceInventory> => {
					const inventory = await request<Omit<SourceInventory, "frame">>(name, {
						action: "inventory",
						field: field,
					});
					const rect = iframe.getBoundingClientRect();
					const visible = rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
					return inventory
						? {
								...inventory,
								frame: name,
								uses: inventory.uses.map((use) => ({ ...use, visible: use.visible && visible })),
							}
						: { frame: name, publication: "", uses: [], unknown: 1 };
				}),
			);
		},
		[iframes, request],
	);
	const describe = useCallback(
		async (frame: string, selector: string) => {
			const original = await request<SourceOccurrence>(frame, { action: "inspect", selector });
			return original ? describeSource(project, frame, original, await inventory(original.field)) : undefined;
		},
		[project, request, inventory],
	);

	return {
		highlight: useCallback(
			(uses: SourceUse[]) => {
				for (const frame of iframes.current.keys())
					void request(frame, {
						action: "highlight",
						uses: uses.filter((use) => use.frame === frame).map((use) => use.original),
					});
			},
			[iframes, request],
		),
		reveal: useCallback(
			(frame: string, original: SourceOccurrence) => request<PickedHit[]>(frame, { action: "reveal", original }),
			[request],
		),
		describe,
		inventory,
		prepare: useCallback(
			async (frame: string, read: SourceRead): Promise<SourceRead> => {
				const inventories = await inventory(read.original.field);
				const result = await sourceReach(project, read.handle, inventories);
				if (!result?.ok) return read;
				const amended = result.read;
				const frames = [...new Set(amended.reach?.uses.map((use) => use.frame) ?? [frame])];
				prepared.current.set(read.generation, { initiator: frame, frames });
				await Promise.all(
					frames.map((name) =>
						request<boolean>(name, {
							action: "prepare",
							generation: read.generation,
							uses: amended.reach?.uses.filter((use) => use.frame === name).map((use) => use.original) ?? [],
						}),
					),
				);
				return amended;
			},
			[inventory, project, request],
		),
		holds: useCallback(
			(frame: string) => [...prepared.current.values()].some((value) => value.frames.includes(frame)),
			[],
		),
		clearFeedback: useCallback(() => {
			for (const frame of iframes.current.keys()) void request<boolean>(frame, { action: "clear-feedback" });
		}, [iframes, request]),
		observer: observer.current,
		revoke: useCallback(
			(publication: SourcePublication) =>
				Promise.all(
					[publication, ...(publication.related ?? [])].map((packet) =>
						request<boolean>(packet.frame, { action: "revoke", publication: packet }),
					),
				),
			[request],
		),
		read: useCallback(
			(frame: string, selector: string, generation: number, field?: string) =>
				request<SourceOccurrence>(frame, { action: "read", selector, generation, field }),
			[request],
		),
		install: useCallback(
			async (publication: SourcePublication, undo = false) => {
				const results = await Promise.all(
					[publication, ...(publication.related ?? [])].map(async (packet) => {
						const result = await request<UseOutcome>(packet.frame, {
							action: "install",
							publication: packet,
							undo,
						});
						if (!result) await request<boolean>(packet.frame, { action: "revoke", publication: packet });
						const uses =
							result?.uses ??
							(result
								? [result]
								: (packet.targets ?? [packet.original]).map((original) => ({
										occurrence: original.occurrence,
										installation: "refused" as const,
										rendered: "unverified" as const,
									})));
						return uses.map((use) => ({ ...use, frame: packet.frame }));
					}),
				);
				prepared.current.delete(publication.generation);
				return combineUseOutcomes(
					[...results.flat(), ...(publication.failures ?? [])],
					publication.original.occurrence,
				);
			},
			[request],
		),
		preview: useCallback(
			async (frame: string, generation: number, text: string) => {
				const targets = prepared.current.get(generation)?.frames ?? [frame];
				return (
					await Promise.all(
						targets.map((frame) => request<boolean>(frame, { action: "preview", generation, text })),
					)
				).every(Boolean);
			},
			[request],
		),
		cancel: useCallback(
			async (frame: string, generation: number) => {
				const targets = prepared.current.get(generation)?.frames ?? [frame];
				prepared.current.delete(generation);
				await Promise.all(targets.map((frame) => request<void>(frame, { action: "cancel", generation })));
			},
			[request],
		),
		complete: useCallback(
			(frame: string, generation: number) => request<SourceOccurrence>(frame, { action: "complete", generation }),
			[request],
		),
	};
}
