import { useEffect, useRef, useState } from "react";
import { cancelProjectTransfer, exportProject, fetchProjection, importProject } from "./api";
import { type Notice, Toast } from "./canvas/toast";
import { ConfirmDialog } from "./confirm-dialog";
import { desktopWindow } from "./desktop-window";
import type { TabProject } from "./tab-strip";
import "./project-transfer.css";

export function useProjectTransfer(onImported: (project: TabProject) => Promise<void>) {
	const input = useRef<HTMLInputElement>(null);
	const [request, setRequest] = useState<TabProject | null>(null);
	const [counts, setCounts] = useState<string | null>(null);
	const [notice, setNotice] = useState<Notice | null>(null);
	const [busy, setBusy] = useState<{ label: string; cancel: () => void } | null>(null);
	const working = useRef(false);
	const [dragging, setDragging] = useState(false);
	const importRef = useRef<(files: File[]) => void>(() => {});
	useEffect(() => {
		if (!request) return;
		let alive = true;
		setCounts(null);
		void fetchProjection(request.name)
			.then((projection) => {
				if (alive && projection) setCounts(`${projection.pages.length} pages · ${projection.frames.length} frames`);
			})
			.catch(() => {});
		return () => {
			alive = false;
		};
	}, [request]);
	useEffect(() => {
		if (!notice) return;
		const timer = setTimeout(() => setNotice(null), 5000);
		return () => clearTimeout(timer);
	}, [notice]);
	useEffect(
		() =>
			desktopWindow()?.onProjectDownload?.((result) =>
				setNotice(
					result.status === "completed"
						? { kind: "success", message: `${result.filename} saved to Downloads` }
						: { kind: "error", message: result.message },
				),
			),
		[],
	);
	const run = async (label: string, cancel: () => void, operation: () => Promise<void>) => {
		if (working.current) {
			setNotice({ kind: "error", message: "Wait for the current transfer to finish." });
			return;
		}
		working.current = true;
		setNotice(null);
		const timer = setTimeout(() => setBusy({ label, cancel }), 160);
		try {
			await operation();
		} catch (error) {
			setNotice({
				kind: "error",
				message:
					error instanceof Error && error.name === "AbortError"
						? "Transfer cancelled."
						: error instanceof Error
							? error.message
							: "Transfer failed. Try again.",
			});
		} finally {
			clearTimeout(timer);
			setBusy(null);
			working.current = false;
		}
	};
	const receive = (files: File[]) => {
		if (files.length !== 1) {
			setNotice({ kind: "error", message: "Choose one project file." });
			return;
		}
		const file = files[0];
		if (!file?.name.toLowerCase().endsWith(".spool")) {
			setNotice({ kind: "error", message: "Choose a .spool project file." });
			return;
		}
		const transfer = crypto.randomUUID();
		void run(
			`Importing ${file.name}…`,
			() => {
				void cancelProjectTransfer(transfer).catch((error: unknown) =>
					setNotice({
						kind: "error",
						message: error instanceof Error ? error.message : "Could not cancel. Try again.",
					}),
				);
			},
			async () => {
				const project = await importProject(file, transfer);
				await onImported(project);
				setNotice({ kind: "success", message: `${project.name} imported` });
			},
		);
	};
	importRef.current = receive;
	useEffect(() => {
		const clear = () => {
			setDragging(false);
		};
		const drag = (event: DragEvent) => {
			if (
				!event.dataTransfer?.types.includes("Files") ||
				![...event.dataTransfer.items].some((item) => projectFileType(item.type))
			)
				return;
			setDragging(true);
		};
		const over = (event: DragEvent) => {
			if (
				event.dataTransfer?.types.includes("Files") &&
				[...event.dataTransfer.items].some((item) => projectFileType(item.type))
			) {
				drag(event);
				event.preventDefault();
			}
		};
		const drop = (event: DragEvent) => {
			clear();
			const files = [...(event.dataTransfer?.files ?? [])];
			if (!files.some((file) => file.name.toLowerCase().endsWith(".spool"))) return;
			event.preventDefault();
			event.stopImmediatePropagation();
			importRef.current(files);
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
		const relay = (event: MessageEvent<unknown>) => {
			if (
				typeof event.data !== "object" ||
				event.data === null ||
				!("spool" in event.data) ||
				event.data.spool !== "external-file-drag"
			)
				return;
			if (
				!("types" in event.data) ||
				!Array.isArray(event.data.types) ||
				!event.data.types.some((type: unknown) => typeof type === "string" && projectFileType(type))
			)
				return;
			if ([...document.querySelectorAll("iframe")].some((frame) => frame.contentWindow === event.source)) {
				setDragging(true);
			}
		};
		window.addEventListener("dragenter", drag, true);
		window.addEventListener("dragover", over, true);
		window.addEventListener("drop", drop, true);
		window.addEventListener("dragleave", leave);
		window.addEventListener("dragend", clear);
		window.addEventListener("blur", clear);
		window.addEventListener("keydown", key);
		window.addEventListener("message", relay);
		return () => {
			window.removeEventListener("dragenter", drag, true);
			window.removeEventListener("dragover", over, true);
			window.removeEventListener("drop", drop, true);
			window.removeEventListener("dragleave", leave);
			window.removeEventListener("dragend", clear);
			window.removeEventListener("blur", clear);
			window.removeEventListener("keydown", key);
			window.removeEventListener("message", relay);
		};
	}, []);
	const startExport = (project: TabProject) => {
		const controller = new AbortController();
		void run(
			`Exporting ${project.name}…`,
			() => controller.abort(),
			async () => {
				const { blob, filename } = await exportProject(project.root, controller.signal);
				const url = URL.createObjectURL(blob);
				const anchor = document.createElement("a");
				anchor.href = url;
				anchor.download = filename;
				anchor.click();
				setTimeout(() => URL.revokeObjectURL(url), 60_000);
				setNotice({ kind: "success", message: "Download started" });
			},
		);
	};
	return {
		exportProject: setRequest,
		importProject: () => input.current?.click(),
		confirming: request !== null,
		surface: (
			<>
				<input
					ref={input}
					type="file"
					accept=".spool"
					hidden
					aria-label="Import project file"
					onChange={(event) => {
						if (event.currentTarget.files?.length) receive([...event.currentTarget.files]);
						event.currentTarget.value = "";
					}}
				/>
				{request && (
					<ConfirmDialog
						title={`Export ${request.name}`}
						description="Download an editable project."
						confirmLabel="Export file"
						onClose={() => setRequest(null)}
						onConfirm={async () => {
							setRequest(null);
							startExport(request);
						}}
					>
						<div className="rounded-md border border-border-raised px-4 py-3">
							<p className="type-control">Entire project</p>
							<p className="text-muted type-detail">{counts ?? "All pages and frames"}</p>
						</div>
						<p className="mt-5 text-muted type-control">Includes frames, layout, flows and local assets.</p>
					</ConfirmDialog>
				)}
				{dragging && (
					<div className="project-transfer-drop is-project">
						<div>
							<p className="type-heading">Drop to open a project</p>
							<p className="mt-2 text-muted type-control">It opens in a new tab and appears in Home.</p>
							<p className="mt-5 type-value">.spool</p>
						</div>
					</div>
				)}
				{busy && (
					<div
						role="status"
						className="project-transfer-progress fixed bottom-20 left-1/2 z-50 w-[360px] -translate-x-1/2 overflow-hidden rounded-md border border-border-raised bg-raised"
					>
						<div className="flex items-center justify-between px-4 py-3">
							<p className="type-control">{busy.label}</p>
							<button type="button" className="text-muted type-control hover:text-text" onClick={busy.cancel}>
								Cancel
							</button>
						</div>
						<div className="h-px bg-border-raised">
							<div className="project-transfer-indicator h-px w-1/3 bg-thread" />
						</div>
					</div>
				)}
				{notice && <Toast notice={notice} />}
			</>
		),
	};
}

function projectFileType(type: string): boolean {
	return [
		"",
		"application/zip",
		"application/x-zip-compressed",
		"application/octet-stream",
		"application/x-spool",
	].includes(type);
}
