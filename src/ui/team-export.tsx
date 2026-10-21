import { type ReactNode, useEffect, useRef, useState } from "react";
import type { CloudTeam } from "../cloud-teams";
import { type Notice, Toast as NoticeToast } from "./canvas/toast";
import { DOWNLOAD_URL } from "./desktop-bridge";
import { desktopWindow } from "./desktop-window";
import { handoverAddress, knock } from "./handover";
import type { MoveItem, MoveItems } from "./home";
import { TextAction, Toast } from "./primitives/feedback";
import { TeamActionRefused, type TeamExportProgress, type TeamsSource, teamSays } from "./team-source";

/*
 * A team export (#200), as Home starts it: Export all in a team's Settings or on a deleted team's page, Export… on a
 * team project's cover. On a Mac it asks for a folder and the daemon writes the export there, its progress in a toast
 * with Cancel; at spool.page it hands the export to spool on this Mac, or offers the download.
 */

/**
 * Starts an export, from a team's address and, for one project, its name. A note comes back to say beside the button
 * when there is one (spool.page's hand-off with no spool to hand to); the Mac's own run says itself in its toast.
 */
export type TeamExporter = (address: string, project?: string) => Promise<ReactNode | null>;

/** How often a running export is asked how far it has come. */
const PROGRESS_MS = 500;

/** The Mac's export through `source`: the folder dialog, the run, its progress and Cancel, and what it ended in. */
export function useTeamExport(source: TeamsSource): { start: TeamExporter; surface: ReactNode } {
	const [running, setRunning] = useState<{ transfer: string; progress: TeamExportProgress | null } | null>(null);
	const [notice, setNotice] = useState<Notice | null>(null);
	const busy = useRef(false);
	useEffect(() => {
		if (!notice || notice.kind === "progress") return;
		const timer = setTimeout(() => setNotice(null), 8000);
		return () => clearTimeout(timer);
	}, [notice]);
	useEffect(() => {
		if (running === null) return;
		const { transfer } = running;
		let alive = true;
		const timer = setInterval(() => {
			void source.exportProgress(transfer).then((progress) => {
				if (alive && progress) setRunning((now) => (now?.transfer === transfer ? { transfer, progress } : now));
			});
		}, PROGRESS_MS);
		return () => {
			alive = false;
			clearInterval(timer);
		};
	}, [running?.transfer, source, running]);
	const start: TeamExporter = async (address, project) => {
		if (busy.current) {
			setNotice({ kind: "error", message: "Wait for the export under way to finish." });
			return null;
		}
		const chooser = desktopWindow()?.chooseDirectory;
		// an app without the folder dialog writes it to Downloads, and says where
		const into = chooser ? await chooser({ purpose: "location", defaultPath: "~/Downloads" }) : "~/Downloads";
		if (into === null) return null;
		busy.current = true;
		const transfer = crypto.randomUUID();
		setNotice(null);
		setRunning({ transfer, progress: null });
		try {
			const { folder } = await source.exportTeam(address, {
				into,
				...(project === undefined ? {} : { project }),
				transfer,
			});
			setNotice({ kind: "success", message: `Exported to ${folder}` });
		} catch (error) {
			setNotice({ kind: "error", message: exportSays(error) });
		} finally {
			busy.current = false;
			setRunning(null);
		}
		return null;
	};
	const surface = (
		<>
			{running && (
				<div className="-translate-x-1/2 fixed bottom-20 left-1/2 z-50">
					<Toast
						className="w-toast"
						message={progressLine(running.progress)}
						action={<TextAction onClick={() => void source.cancelExport(running.transfer)}>Cancel</TextAction>}
						progress
					/>
				</div>
			)}
			{notice && (
				<div className="-translate-x-1/2 fixed bottom-20 left-1/2 z-50">
					<NoticeToast notice={notice} />
				</div>
			)}
		</>
	);
	return { start, surface };
}

/** "Exporting checkout, 1 of 2 · 1,200 saves", or "Exporting…" before the daemon says. */
function progressLine(progress: TeamExportProgress | null): string {
	if (progress === null) return "Exporting…";
	const which = progress.projects > 1 ? `, ${progress.index} of ${progress.projects}` : "";
	const saves = `${progress.saves.toLocaleString("en-US")} ${progress.saves === 1 ? "save" : "saves"}`;
	return `Exporting ${progress.project}${which} · ${saves}`;
}

/** What an export that didn't finish says: the daemon's own sentence (no git, cancelled), or spool.page's reason. */
function exportSays(error: unknown): string {
	if (error instanceof TeamActionRefused && error.said !== undefined && error.code.startsWith("export_"))
		return error.said;
	if (error instanceof TeamActionRefused && error.code === "team_not_found")
		return "This team can’t be exported any more.";
	return teamSays(error, "The export didn’t finish. Try again.");
}

/** Export… on each cover of a team project whose team this account is an admin of. */
export function teamExportItems(
	teams: readonly Pick<CloudTeam, "address" | "role">[],
	start: (address: string, project: string) => void,
): MoveItems {
	return (project) => {
		const link = project.team;
		if (link === undefined || teams.find((team) => team.address === link.team)?.role !== "admin") return [];
		const item: MoveItem = { label: "Export…", onClick: () => start(link.team, link.project) };
		return [item];
	};
}

/**
 * Export at spool.page: spool on this Mac is handed the export when it answers, and asks for the folder there.
 * When it doesn't answer, the note offers the download.
 */
export async function handOffExport(
	address: string,
	project: string | undefined,
	how: { knock?: () => Promise<boolean>; go?: (url: string) => void; open: (url: string) => void },
): Promise<ReactNode | null> {
	const answered = await (how.knock ?? knock)();
	if (answered) {
		(how.go ?? ((url) => window.location.assign(url)))(
			handoverAddress({ team: address, project: project ?? null, export: true }),
		);
		return null;
	}
	return (
		<>
			spool isn’t open on this Mac. Open it to export, or{" "}
			<TextAction className="px-0" onClick={() => how.open(DOWNLOAD_URL)}>
				download it
			</TextAction>
			.
		</>
	);
}
