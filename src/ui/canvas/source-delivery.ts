import type { RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import {
	combineUseOutcomes,
	type SourceInventory,
	type SourceOccurrence,
	type SourceOperation,
	type SourcePublication,
	type SourceRead,
	type SourceUse,
	type UseOutcome,
} from "../../source-edit";
import { describeSource, respondSourceObservation, sourceIsCurrent, sourceReach, subscribeSse } from "../api";
import type { PickedHit } from "./protocol";

interface OutcomeGroup {
	publication: SourcePublication;
	ready: boolean;
	frames: Map<
		string,
		{ packet: SourcePublication; window: Window | null | undefined; result?: UseOutcome; revision: number }
	>;
}
function groupOutcome(group: OutcomeGroup): UseOutcome {
	return combineUseOutcomes(
		[...group.frames]
			.flatMap<UseOutcome>(([frame, entry]) => {
				const result = entry.result;
				return result ? (result.uses?.length ? result.uses : [result]).map((use) => ({ ...use, frame })) : [];
			})
			.concat(group.publication.failures ?? []),
		group.publication.original.occurrence,
	);
}

/** Calls belong to the original iframe WindowProxy, never just a frame name. */
export function useSourceDelivery(project: string, iframes: RefObject<Map<string, HTMLIFrameElement>>) {
	const observer = useRef(crypto.randomUUID());
	const [active, setActive] = useState<{
		frame: string;
		selector: string;
		generation: number;
		field: string | undefined;
		operation: SourceOperation;
	}>();
	const outcomes = useRef<OutcomeGroup | undefined>(undefined);
	const outcomeListeners = useRef(new Set<(publication: string, outcome: UseOutcome) => void>());
	const [liveFrames, setLiveFrames] = useState<ReadonlySet<string>>(new Set());
	const descriptionVersion = useRef(0);
	const inverseHolds = useRef(new Map<string, { frames: string[]; structuralGeneration?: number }>());
	const structuralHistory = useRef<readonly number[]>([]);
	const sentStructures = useRef("[]");
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
				data.spool === "source-outcome" &&
				"frame" in data &&
				typeof data.frame === "string" &&
				"publication" in data &&
				"owner" in data &&
				"generation" in data &&
				"result" in data
			) {
				const group = outcomes.current;
				const entry = group?.frames.get(data.frame);
				if (
					!group ||
					!entry ||
					event.source !== entry.window ||
					iframes.current.get(data.frame)?.contentWindow !== entry.window ||
					data.publication !== entry.packet.packet.id ||
					data.owner !== entry.packet.owner ||
					data.generation !== entry.packet.generation
				)
					return;
				const result = data.result as UseOutcome | undefined;
				if (!result || typeof result.rendered !== "string" || typeof result.installation !== "string") return;
				entry.result = result;
				entry.revision++;
				if (group.ready)
					for (const listener of outcomeListeners.current)
						listener(group.publication.packet.id, groupOutcome(group));
				return;
			}
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
				// Native input already updated every governed use in its own frame.
				// Echoing it back could replace a newer native edit with queued text.
				for (const frame of held.frames.filter((frame) => frame !== held.initiator))
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
	const retainStructuralEvidence = useCallback(
		(loadedFrame?: string) => {
			const generations = [
				...new Set([
					...structuralHistory.current,
					...[...inverseHolds.current.values()].flatMap((hold) =>
						hold.structuralGeneration === undefined ? [] : [hold.structuralGeneration],
					),
				]),
			].sort((a, b) => a - b);
			const serialized = JSON.stringify(generations);
			if (loadedFrame === undefined && sentStructures.current === serialized) return;
			if (loadedFrame === undefined) sentStructures.current = serialized;
			for (const frame of loadedFrame === undefined ? iframes.current.keys() : [loadedFrame])
				void request(frame, { action: "retain-structure", generations });
		},
		[iframes, request],
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
		async (
			field?: string,
			operation: SourceOperation = { kind: "literal", ...(field ? { field } : {}) },
		): Promise<SourceInventory[]> => {
			return await Promise.all(
				[...iframes.current].map(async ([name, iframe]): Promise<SourceInventory> => {
					const inventory = await request<Omit<SourceInventory, "frame">>(name, {
						action: "inventory",
						operation,
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
		async (
			frame: string,
			selector: string,
			field?: string,
			operation: SourceOperation = { kind: "literal", ...(field ? { field } : {}) },
		) => {
			const version = ++descriptionVersion.current;
			setLiveFrames(new Set(iframes.current.keys()));
			const original = await request<SourceOccurrence>(frame, {
				action: "inspect",
				selector,
				field,
				operation,
			});
			const description = original
				? await describeSource(project, frame, original, await inventory(original.field, operation), operation)
				: undefined;
			if (version === descriptionVersion.current)
				setLiveFrames(new Set(description?.reach?.uses.map((use) => use.frame) ?? []));
			return description;
		},
		[project, request, inventory, iframes],
	);

	return {
		describeField: useCallback(
			async (frame: string, selector: string, field: string) => {
				const original = await request<SourceOccurrence>(frame, {
					action: "inspect",
					selector,
					field,
					operation: { kind: "literal", ...(field ? { field } : {}) },
				});
				return original ? describeSource(project, frame, original, []) : undefined;
			},
			[project, request],
		),
		verifyReload: useCallback(
			async (frame: string, selector: string, field?: string) => {
				const original = await request<SourceOccurrence>(frame, {
					action: "inspect",
					selector,
					field,
					operation: { kind: "literal", ...(field ? { field } : {}) },
				});
				if (!original || !(await sourceIsCurrent(project, original.publication))) return;
				const description = await describeSource(project, frame, original, await inventory(field));
				if (!description?.reach) return;
				const outcomes = await Promise.all(
					description.reach.uses.map(
						async (use): Promise<UseOutcome> => ({
							...((await request<UseOutcome>(use.frame, {
								action: "verify",
								original: use.original,
								expected: { kind: "literal", value: description.value, absent: original.absent ?? false },
							})) ?? { occurrence: use.original.occurrence, installation: "refused", rendered: "unverified" }),
							frame: use.frame,
						}),
					),
				);
				outcomes.push(...(description.reach.unverified ?? []));
				for (const name of description.reach.unknown)
					outcomes.push({ frame: name, occurrence: "", installation: "refused", rendered: "unverified" });
				for (const name of description.reach.unmounted)
					outcomes.push({ frame: name, occurrence: "", installation: "refused", rendered: "unmounted" });
				return { description, outcome: combineUseOutcomes(outcomes, original.occurrence) };
			},
			[project, request, inventory],
		),

		active,
		liveFrames,
		releaseDescription: useCallback(() => {
			descriptionVersion.current++;
			setActive(undefined);
			setLiveFrames(new Set());
		}, []),
		retainStructures: useCallback(
			(generations: readonly number[], loadedFrame?: string) => {
				structuralHistory.current = generations;
				retainStructuralEvidence(loadedFrame);
			},
			[retainStructuralEvidence],
		),
		retireStructure: useCallback(
			(generation: number) => {
				for (const frame of iframes.current.keys()) void request(frame, { action: "retire-structure", generation });
			},
			[iframes, request],
		),
		holdInverse: useCallback(
			(key: string, frames: string[], structuralGeneration?: number) => {
				inverseHolds.current.set(key, {
					frames,
					...(structuralGeneration === undefined ? {} : { structuralGeneration }),
				});
				retainStructuralEvidence();
			},
			[retainStructuralEvidence],
		),
		releaseInverse: useCallback(
			(key: string) => {
				inverseHolds.current.delete(key);
				retainStructuralEvidence();
			},
			[retainStructuralEvidence],
		),
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
				const inventories = await inventory(read.original.field, read.operation);
				const result = await sourceReach(project, read.handle, inventories);
				if (!result?.ok) return read;
				const amended = result.read;
				const frames = [...new Set(amended.reach?.uses.map((use) => use.frame) ?? [frame])];
				prepared.current.set(read.generation, { initiator: frame, frames });
				await Promise.all(
					frames.map((name) =>
						request<boolean>(name, {
							action: "prepare",
							structure: read.structure,
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
			(frame: string) =>
				[...prepared.current.values()].some((value) => value.frames.includes(frame)) ||
				[...inverseHolds.current.values()].some((hold) => hold.frames.includes(frame)),
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
			(
				frame: string,
				selector: string,
				generation: number,
				field?: string,
				operation: SourceOperation = { kind: "literal", ...(field ? { field } : {}) },
			) => {
				setActive({ frame, selector, generation, field, operation });
				outcomes.current = undefined;
				return request<SourceOccurrence>(frame, { action: "read", selector, generation, field, operation });
			},
			[request],
		),
		observeOutcomes: useCallback((listener: (publication: string, outcome: UseOutcome) => void) => {
			outcomeListeners.current.add(listener);
			return () => {
				outcomeListeners.current.delete(listener);
			};
		}, []),
		currentOutcome: useCallback((publication: string) => {
			const group = outcomes.current;
			return group?.publication.packet.id === publication && group.ready ? groupOutcome(group) : undefined;
		}, []),
		install: useCallback(
			async (publication: SourcePublication, undo = false) => {
				const group: OutcomeGroup = {
					publication,
					ready: false,
					frames: new Map(
						[publication, ...(publication.related ?? [])].map((packet) => [
							packet.frame,
							{ packet, window: iframes.current.get(packet.frame)?.contentWindow, revision: 0 },
						]),
					),
				};
				outcomes.current = group;
				await Promise.all(
					[...group.frames].map(async ([frame, entry]) => {
						const { packet } = entry;
						const result = await request<UseOutcome>(frame, { action: "install", publication: packet, undo });
						if (!result) await request<boolean>(frame, { action: "revoke", publication: packet });
						if (entry.revision === 0)
							entry.result =
								result ??
								combineUseOutcomes(
									(packet.targets ?? [packet.original]).map((original) => ({
										occurrence: original.occurrence,
										installation: "refused",
										rendered: "unverified",
									})),
									packet.original.occurrence,
								);
					}),
				);
				prepared.current.delete(publication.generation);
				group.ready = true;
				return groupOutcome(group);
			},
			[iframes, request],
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
