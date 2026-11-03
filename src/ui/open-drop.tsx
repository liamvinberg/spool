import { useEffect, useRef, useState } from "react";
import { desktopWindow } from "./desktop-window";
import { FolderIcon } from "./icons";
import "./open-drop.css";

/** What a drop handed Open…: a path or a link to read, a .spool file's bytes in a browser, or why it can't. */
export type Dropped =
	| { kind: "given"; given: string }
	| { kind: "bytes"; file: File }
	| { kind: "refused"; says: string };

const isSpool = (name: string) => name.toLowerCase().endsWith(".spool");

/**
 * Read a drop. The Mac app tells a dropped file's or folder's path, which is read like anything else Open… is given;
 * a browser tells only bytes, so it can import a `.spool` file and must send a folder to Open…. A link dragged in from
 * a browser comes as a URI list. Undefined when nothing in it is Open…'s.
 */
export function droppedOf(
	data: Pick<DataTransfer, "files" | "items" | "getData">,
	pathForFile?: (file: File) => string,
): Dropped | undefined {
	const files = [...data.files];
	if (files.length > 1) return { kind: "refused", says: "Drop one folder or one .spool file." };
	const file = files[0];
	if (file !== undefined) {
		const path = pathForFile?.(file);
		if (path) return { kind: "given", given: path };
		if ([...data.items][0]?.webkitGetAsEntry?.()?.isDirectory)
			return { kind: "refused", says: "A browser can't open a dropped folder. Use Open… instead." };
		if (isSpool(file.name)) return { kind: "bytes", file };
		return { kind: "refused", says: "spool opens a folder, a .spool file or a link to a project." };
	}
	const link = (data.getData("text/uri-list") || data.getData("text/plain"))
		.split(/\r?\n/u)
		.find((line) => line.trim() !== "" && !line.startsWith("#"));
	return link === undefined ? undefined : { kind: "given", given: link.trim() };
}

/** File types a project file can come as before its name is known: zip, unknown, or none. */
function projectFileType(type: string): boolean {
	return [
		"",
		"application/zip",
		"application/x-zip-compressed",
		"application/octet-stream",
		"application/x-spool",
	].includes(type);
}

/**
 * Drop on the window. On Home anything Open… takes is taken: a folder, a `.spool` file, a link. Over a project's
 * canvas only a `.spool` file is, and every other file goes on to the live frame under the pointer, which a frame
 * catching the pointer would otherwise keep from the shell: while a file is held, frames let it pass.
 *
 * Nothing names what is held before it is let go (a page reads only its kinds), so the target says what letting go
 * does in general; the finding then says it exactly.
 */
export function useOpenDrop(home: boolean, onDrop: (dropped: Dropped) => void) {
	const [held, setHeld] = useState(false);
	const live = useRef({ home, onDrop });
	live.current = { home, onDrop };
	useEffect(() => {
		const shielded = new Set<HTMLIFrameElement>();
		const shield = () => {
			for (const frame of document.querySelectorAll("iframe")) {
				if (getComputedStyle(frame).pointerEvents !== "none") {
					shielded.add(frame);
					frame.dataset.projectDropShield = "";
				}
			}
			setHeld(true);
		};
		const clear = () => {
			for (const frame of shielded) delete frame.dataset.projectDropShield;
			shielded.clear();
			setHeld(false);
		};
		const ours = (data: DataTransfer | null) => {
			if (data === null || document.querySelector("dialog[open]") !== null) return false;
			if (data.types.includes("Files"))
				return (
					live.current.home || [...data.items].some((item) => item.kind === "file" && projectFileType(item.type))
				);
			return live.current.home && data.types.includes("text/uri-list");
		};
		const over = (event: DragEvent) => {
			if (!ours(event.dataTransfer)) return;
			event.preventDefault();
			if (shielded.size === 0) shield();
		};
		const drop = (event: DragEvent) => {
			const held = new Set(shielded);
			clear();
			const data = event.dataTransfer;
			if (data === null || !ours(data)) return;
			const files = [...data.files];
			if (!live.current.home && !files.some((file) => isSpool(file.name))) {
				// names show only now: hand what isn't a project to the live frame it was let go over
				const target = document.elementFromPoint(event.clientX, event.clientY);
				if (files.length > 0 && target instanceof HTMLIFrameElement && held.has(target)) {
					const rect = target.getBoundingClientRect();
					target.contentWindow?.postMessage(
						{
							spool: "external-file-drop",
							files,
							x: ((event.clientX - rect.left) * target.clientWidth) / rect.width,
							y: ((event.clientY - rect.top) * target.clientHeight) / rect.height,
						},
						"*",
					);
					event.preventDefault();
					event.stopImmediatePropagation();
				}
				return;
			}
			const dropped = droppedOf(data, desktopWindow()?.pathForFile);
			if (dropped === undefined) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			live.current.onDrop(dropped);
		};
		const leave = (event: DragEvent) => {
			if (
				event.relatedTarget === null &&
				(event.clientX <= 0 || event.clientY <= 0 || event.clientX >= innerWidth || event.clientY >= innerHeight)
			)
				clear();
		};
		const key = (event: KeyboardEvent) => {
			if (event.key === "Escape") clear();
		};
		// a frame tells the shell a file is held over it, since the drag never reaches the window behind it
		const relay = (event: MessageEvent<unknown>) => {
			const data = event.data;
			if (typeof data !== "object" || data === null || !("spool" in data) || data.spool !== "external-file-drag")
				return;
			if (
				!("types" in data) ||
				!Array.isArray(data.types) ||
				!data.types.some((type: unknown) => typeof type === "string" && projectFileType(type))
			)
				return;
			if ([...document.querySelectorAll("iframe")].some((frame) => frame.contentWindow === event.source)) shield();
		};
		window.addEventListener("dragenter", over, true);
		window.addEventListener("dragover", over, true);
		window.addEventListener("drop", drop, true);
		window.addEventListener("dragleave", leave);
		window.addEventListener("dragend", clear);
		window.addEventListener("blur", clear);
		window.addEventListener("keydown", key);
		window.addEventListener("message", relay);
		return () => {
			for (const frame of shielded) delete frame.dataset.projectDropShield;
			window.removeEventListener("dragenter", over, true);
			window.removeEventListener("dragover", over, true);
			window.removeEventListener("drop", drop, true);
			window.removeEventListener("dragleave", leave);
			window.removeEventListener("dragend", clear);
			window.removeEventListener("blur", clear);
			window.removeEventListener("keydown", key);
			window.removeEventListener("message", relay);
		};
	}, []);
	return held;
}

/** The window while something is held over it: it will take it, and says what letting go does. */
export function DropTarget() {
	return (
		<div
			data-drop-target=""
			className="pointer-events-none fixed inset-0 z-[60] animate-find-in bg-surface-window/85"
		>
			<div className="absolute inset-3 animate-chrome-in rounded-lg border-2 border-accent border-dashed" />
			<div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
				<FolderIcon className="size-16 text-secondary" />
				<p className="mt-1 text-primary type-heading">Let go to open it</p>
				<p className="text-secondary type-control">A folder, a .spool file or a link to a project.</p>
			</div>
		</div>
	);
}
