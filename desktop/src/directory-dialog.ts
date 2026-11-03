import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { OpenDialogOptions } from "electron";

/** Open… takes a folder or a .spool file; a location and an export take a folder. */
export interface DirectoryRequest {
	purpose: "location" | "open" | "export";
	defaultPath: string;
}

export function directoryDialogOptions(request: unknown): OpenDialogOptions {
	if (typeof request !== "object" || request === null) throw new Error("Invalid folder request.");
	if (!("purpose" in request) || !("defaultPath" in request)) throw new Error("Invalid folder request.");
	const { purpose, defaultPath } = request;
	if (purpose !== "location" && purpose !== "open" && purpose !== "export")
		throw new Error("Invalid folder action.");
	if (typeof defaultPath !== "string" || defaultPath.includes("\0")) throw new Error("Invalid folder path.");
	const path =
		defaultPath === "~"
			? homedir()
			: defaultPath.startsWith("~/")
				? join(homedir(), defaultPath.slice(2))
				: defaultPath;
	if (!isAbsolute(path)) throw new Error("Choose an absolute folder path.");
	return {
		defaultPath: path,
		buttonLabel: { location: "Choose", open: "Open", export: "Export here" }[purpose],
		message: {
			location: "Choose where new projects go.",
			open: "Choose a folder or a .spool file.",
			export: "Choose the folder the export is written into.",
		}[purpose],
		...(purpose === "open"
			? {
					properties: ["openDirectory", "openFile"],
					filters: [{ name: "spool project", extensions: ["spool"] }],
				}
			: { properties: ["openDirectory", "createDirectory"] }),
	};
}
