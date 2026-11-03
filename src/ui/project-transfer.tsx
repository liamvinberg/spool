import { useEffect, useRef, useState } from "react";
import { exportProject, fetchProjection } from "./api";
import { type Notice, Toast as NoticeToast } from "./canvas/toast";
import { ConfirmDialog } from "./confirm-dialog";
import { desktopWindow } from "./desktop-window";
import { TextAction, Toast } from "./primitives/feedback";
import type { TabProject } from "./tab-strip";

/** Export…: a project as a .spool file, asked once, with the download's progress and how it ended. */
export function useProjectExport() {
	const [request, setRequest] = useState<TabProject | null>(null);
	const [counts, setCounts] = useState<string | null>(null);
	const [notice, setNotice] = useState<Notice | null>(null);
	const [busy, setBusy] = useState<{ label: string; cancel: () => void } | null>(null);
	const working = useRef(false);
	useEffect(() => {
		if (!request) return;
		let alive = true;
		setCounts(null);
		void fetchProjection(request.name)
			.then((projection) => {
				if (alive && projection)
					setCounts(
						`${projection.pages.length + 1} ${projection.pages.length === 0 ? "page" : "pages"} · ${projection.frames.length} ${projection.frames.length === 1 ? "frame" : "frames"}`,
					);
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
		confirming: request !== null,
		surface: (
			<>
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
						<div className="project-transfer-summary rounded-md border border-line-strong px-4 py-3">
							<p className="m-0 text-primary type-control">Entire project</p>
							<p className="m-0 mt-[4px] text-secondary type-detail">{counts ?? "All pages and frames"}</p>
						</div>
						<p className="project-transfer-description m-0 mt-[20px] text-secondary [font:var(--type-control)]">
							Includes frames, layout, flows and local assets.
						</p>
					</ConfirmDialog>
				)}
				{busy && (
					<div className="-translate-x-1/2 fixed bottom-20 left-1/2 z-50">
						<Toast
							className="w-toast"
							message={busy.label}
							action={<TextAction onClick={busy.cancel}>Cancel</TextAction>}
							progress
						/>
					</div>
				)}
				{notice && <NoticeToast notice={notice} />}
			</>
		),
	};
}
