import { linkSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { basename, join } from "node:path";
import type { DownloadItem, Session, WebContents } from "electron";

export type ProjectDownloadResult = { status: "completed"; filename: string } | { status: "failed"; message: string };

/** Publish a finished download without overwriting a file, even under concurrent exports. */
function publish(source: string, directory: string, filename: string): string {
	const stem = filename.slice(0, -".spool".length);
	for (let suffix = 0; ; suffix++) {
		const candidate = suffix === 0 ? filename : `${stem} (${suffix}).spool`;
		try {
			linkSync(source, join(directory, candidate));
			return candidate;
		} catch (error) {
			if (!(error instanceof Error && "code" in error && error.code === "EEXIST")) throw error;
		}
	}
}

export function saveProjectDownload(
	item: DownloadItem,
	downloads: string,
	report: (result: ProjectDownloadResult) => void,
): void {
	let temporary: string | undefined;
	try {
		mkdirSync(downloads, { recursive: true });
		temporary = mkdtempSync(join(downloads, ".spool-download-"));
		const staging = temporary;
		const source = join(staging, "project.spool");
		const filename = basename(item.getFilename()).replaceAll("\\", "_");
		item.setSavePath(source);
		item.once("done", (_event, state) => {
			let result: ProjectDownloadResult;
			try {
				if (state !== "completed") throw new Error("The project download did not finish. Try exporting again.");
				result = { status: "completed", filename: publish(source, downloads, filename) };
			} catch (error) {
				result = {
					status: "failed",
					message: error instanceof Error ? error.message : "Could not save the project.",
				};
			} finally {
				rmSync(staging, { recursive: true, force: true });
			}
			report(result);
		});
	} catch (error) {
		item.cancel();
		if (temporary !== undefined) rmSync(temporary, { recursive: true, force: true });
		report({ status: "failed", message: error instanceof Error ? error.message : "Could not save the project." });
	}
}

export function installProjectDownloads(
	session: Session,
	downloads: () => string,
	isCanvasDownload: (contents: WebContents, url: string) => boolean,
): void {
	session.on("will-download", (_event, item, contents) => {
		if (!item.getFilename().toLowerCase().endsWith(".spool") || !isCanvasDownload(contents, item.getURL())) return;
		saveProjectDownload(item, downloads(), (result) => {
			if (!contents.isDestroyed()) contents.send("spool:project-download", result);
		});
	});
}
