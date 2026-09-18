import { desktopBridge } from "./desktop-bridge";

const saves = new Map<() => Promise<void>, boolean>();
let barrier: Set<Promise<Response>> | undefined;
let preparing = false;
const writes = new Set<Promise<Response>>();

export function beforeUpdate(save: () => Promise<void>, local = false): () => void {
	saves.set(save, local);
	return () => {
		saves.delete(save);
	};
}

export function trackUpdateWrite(write: Promise<Response>): Promise<Response> {
	writes.add(write);
	barrier?.add(write);
	void write.finally(() => writes.delete(write)).catch(() => {});
	return write;
}

/** The native cover blocks new input before this barrier is requested. */
export async function prepareForUpdate(localOnly = false): Promise<void> {
	if (preparing) throw new Error("Saving is already in progress.");
	preparing = true;
	const pending = new Set(localOnly ? [] : writes);
	if (!localOnly) barrier = pending;
	try {
		await Promise.all([...saves].filter(([, local]) => !localOnly || local).map(([save]) => save()));
		let observed = 0;
		while (observed < pending.size) {
			const batch = [...pending].slice(observed);
			observed = pending.size;
			const results = await Promise.all(batch);
			if (results.some((response) => !response.ok)) throw new Error("Some changes could not be saved. Try again.");
		}
	} finally {
		barrier = undefined;
		preparing = false;
	}
}

export function reloadCanvas(): void {
	const bridge = desktopBridge();
	if (bridge?.reload) void bridge.reload().catch(() => {});
	else if (typeof window !== "undefined") window.location.reload();
}
