import { closeSync, mkdirSync, mkdtempSync, openSync, renameSync, rmSync } from "node:fs";
import { basename, extname, join, resolve } from "node:path";
import type { DownloadItem, Session, WebContents } from "electron";

export type ProjectDownloadResult = { status: "completed"; filename: string } | { status: "failed"; message: string };

/** A frame export the canvas asked for, by the file name it asked for. */
export type ExportDownloadResult =
	| { status: "completed"; requested: string; filename: string; path: string }
	| { status: "failed"; requested: string; message: string };

type SavedDownload = { status: "completed"; filename: string; path: string } | { status: "failed"; message: string };

/** What a canvas download is, by its extension: a project, a frame export, or neither. */
function downloadKind(filename: string): "project" | "export" | undefined {
	const extension = extname(filename).toLowerCase();
	if (extension === ".spool") return "project";
	if (extension === ".png" || extension === ".pdf" || extension === ".html") return "export";
	return undefined;
}

/**
 * Publish a finished download without overwriting a file, even under concurrent exports: the name is
 * claimed by an exclusive create, then the download is renamed over that empty claim. A hard link
 * would do it in one step, but macOS refused it in Downloads (EPERM) from the running app.
 */
function publish(source: string, directory: string, filename: string): string {
	const extension = extname(filename);
	const stem = filename.slice(0, filename.length - extension.length);
	for (let suffix = 0; ; suffix++) {
		const candidate = suffix === 0 ? filename : `${stem} (${suffix})${extension}`;
		const target = join(directory, candidate);
		try {
			closeSync(openSync(target, "wx"));
		} catch (error) {
			if (error instanceof Error && "code" in error && error.code === "EEXIST") continue;
			throw error;
		}
		try {
			renameSync(source, target);
		} catch (error) {
			rmSync(target, { force: true });
			throw error;
		}
		return candidate;
	}
}

/** Save a download straight into the downloads folder, without a Save dialog, beside any file of its name. */
export function saveDownload(
	item: DownloadItem,
	downloads: string,
	noun: string,
	report: (result: SavedDownload) => void,
): void {
	let temporary: string | undefined;
	try {
		mkdirSync(downloads, { recursive: true });
		temporary = mkdtempSync(join(downloads, ".spool-download-"));
		const staging = temporary;
		const filename = basename(item.getFilename()).replaceAll("\\", "_");
		const source = join(staging, `download${extname(filename)}`);
		item.setSavePath(source);
		item.once("done", (_event, state) => {
			let result: SavedDownload;
			try {
				if (state !== "completed") throw new Error(`The ${noun} download did not finish. Try exporting again.`);
				const published = publish(source, downloads, filename);
				result = { status: "completed", filename: published, path: join(downloads, published) };
			} catch (error) {
				result = {
					status: "failed",
					message: error instanceof Error ? error.message : `Could not save the ${noun}.`,
				};
			} finally {
				rmSync(staging, { recursive: true, force: true });
			}
			report(result);
		});
	} catch (error) {
		item.cancel();
		if (temporary !== undefined) rmSync(temporary, { recursive: true, force: true });
		report({ status: "failed", message: error instanceof Error ? error.message : `Could not save the ${noun}.` });
	}
}

export interface CanvasDownloads {
	/** Whether this app saved the file at path in this session, the only files the canvas may reveal. */
	saved(path: unknown): path is string;
}

/**
 * Canvas downloads of a project (.spool) or a frame export (.png, .pdf, .html)
 * go straight to Downloads and are reported to the page that asked for them.
 */
export function installCanvasDownloads(
	session: Pick<Session, "on">,
	downloads: () => string,
	isCanvasDownload: (contents: WebContents, url: string) => boolean,
): CanvasDownloads {
	const saved = new Set<string>();
	session.on("will-download", (_event, item, contents) => {
		const requested = item.getFilename();
		const kind = downloadKind(requested);
		if (kind === undefined || !isCanvasDownload(contents, item.getURL())) return;
		saveDownload(item, downloads(), kind, (result) => {
			if (result.status === "completed") saved.add(resolve(result.path));
			if (contents.isDestroyed()) return;
			if (kind === "project")
				contents.send(
					"spool:project-download",
					result.status === "completed"
						? { status: "completed", filename: result.filename }
						: { status: "failed", message: result.message },
				);
			else contents.send("spool:export-download", { ...result, requested } satisfies ExportDownloadResult);
		});
	});
	return { saved: (path): path is string => typeof path === "string" && saved.has(resolve(path)) };
}
