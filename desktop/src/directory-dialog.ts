import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { OpenDialogOptions } from "electron";

export interface DirectoryRequest {
	purpose: "location" | "add" | "open" | "export";
	defaultPath: string;
}

export function directoryDialogOptions(request: unknown): OpenDialogOptions {
	if (typeof request !== "object" || request === null) throw new Error("Invalid folder request.");
	if (!("purpose" in request) || !("defaultPath" in request)) throw new Error("Invalid folder request.");
	const { purpose, defaultPath } = request;
	if (purpose !== "location" && purpose !== "add" && purpose !== "open" && purpose !== "export")
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
		buttonLabel: {
			location: "Choose location",
			add: "Add spool here",
			open: "Open project",
			export: "Export here",
		}[purpose],
		message: {
			location: "Choose where to save projects.",
			add: "Add a design folder inside the selected folder.",
			open: "Choose a folder that already has a Spool project.",
			export: "Choose the folder the export is written into.",
		}[purpose],
		properties: purpose === "open" ? ["openDirectory"] : ["openDirectory", "createDirectory"],
	};
}
