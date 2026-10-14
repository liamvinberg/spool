import { shimConfig } from "./natives";

/**
 * Files entering a live iframe cannot bubble to the application shell. Only
 * announce the gesture; archive bytes must arrive in a real shell drop.
 */
export function announceFileDrags(): void {
	for (const type of ["dragenter", "dragover"] as const) {
		addEventListener(
			type,
			(event) => {
				if (!event.isTrusted || window.parent === window || !event.dataTransfer?.types.includes("Files")) return;
				window.parent.postMessage(
					{
						spool: "external-file-drag",
						types: Array.from(event.dataTransfer.items, (item) => item.type),
					},
					"*",
				);
			},
			{ capture: true },
		);
	}
}

/**
 * The shell can distinguish project files only once their names become
 * readable at drop. Give every other file back to the authored live surface.
 */
export function receiveFileDrops(): void {
	addEventListener("message", (event) => {
		const config = shimConfig();
		const message = event.data;
		if (event.source !== parent || event.origin !== config.controlOrigin || message?.spool !== "external-file-drop")
			return;
		if (
			!Array.isArray(message.files) ||
			!message.files.every((file: unknown) => file instanceof File) ||
			!Number.isFinite(message.x) ||
			!Number.isFinite(message.y)
		)
			return;
		const target = document.elementFromPoint(message.x, message.y);
		if (!target) return;
		const dataTransfer = new DataTransfer();
		for (const file of message.files as File[]) dataTransfer.items.add(file);
		for (const type of ["dragenter", "dragover"])
			target.dispatchEvent(
				new DragEvent(type, {
					bubbles: true,
					cancelable: true,
					composed: true,
					clientX: message.x,
					clientY: message.y,
					dataTransfer,
				}),
			);
		const drop = new DragEvent("drop", {
			bubbles: true,
			cancelable: true,
			composed: true,
			clientX: message.x,
			clientY: message.y,
			dataTransfer,
		});
		target.dispatchEvent(drop);
		if (!drop.defaultPrevented && target instanceof HTMLInputElement && target.type === "file") {
			target.files = dataTransfer.files;
			target.dispatchEvent(new Event("input", { bubbles: true }));
			target.dispatchEvent(new Event("change", { bubbles: true }));
		}
	});
}
