import { randomUUID } from "node:crypto";
import { openAsBlob } from "node:fs";
import { stat } from "node:fs/promises";
import { extname } from "node:path";

/** Finder may deliver documents before Electron or the daemon is ready. */
export class ProjectOpenQueue {
	private readonly pending: string[] = [];
	private ready = false;
	private running = false;

	constructor(
		private readonly open: (path: string) => Promise<void>,
		private readonly failed: (path: string, error: unknown) => Promise<void>,
	) {}

	add(path: string): void {
		this.pending.push(path);
		void this.drain();
	}

	start(): void {
		this.ready = true;
		void this.drain();
	}

	private async drain(): Promise<void> {
		if (!this.ready || this.running) return;
		this.running = true;
		try {
			for (;;) {
				const path = this.pending.shift();
				if (path === undefined) break;
				try {
					await this.open(path);
				} catch (error) {
					await this.failed(path, error);
				}
			}
		} finally {
			this.running = false;
		}
	}
}

/** Use the daemon's importer and session, just as the canvas does. */
export async function importProjectFile(path: string, origin: string, controlToken: string): Promise<string> {
	if (extname(path).toLowerCase() !== ".spool") throw new Error("Choose a .spool project file.");
	if (!(await stat(path)).isFile()) throw new Error("Choose a .spool project file.");
	const headers = { "x-spool-control": controlToken };
	const response = await fetch(`${origin}/api/projects/import?transfer=${randomUUID()}`, {
		method: "POST",
		headers: { ...headers, "Content-Type": "application/zip" },
		body: await openAsBlob(path),
	});
	const result: unknown = await response.json();
	if (!response.ok) {
		throw new Error(
			typeof result === "object" && result !== null && "error" in result && typeof result.error === "string"
				? result.error
				: "Spool could not import this file.",
		);
	}
	if (
		typeof result !== "object" ||
		result === null ||
		!("root" in result) ||
		typeof result.root !== "string" ||
		!("name" in result) ||
		typeof result.name !== "string"
	)
		throw new Error("Spool returned an invalid project.");
	const opened = await fetch(`${origin}/api/session`, {
		method: "PUT",
		headers: { ...headers, "Content-Type": "application/json" },
		body: JSON.stringify({ root: result.root, open: true }),
	});
	if (!opened.ok)
		throw new Error(`The project was imported to ${result.root}, but could not be opened. Open it from Home.`);
	return `${origin}/p/${encodeURIComponent(result.name)}`;
}
