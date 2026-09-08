import { homedir } from "node:os";
import { isAbsolute, join } from "node:path";
import type { OpenDialogOptions } from "electron";

export interface DirectoryRequest {
	purpose: "location" | "add" | "open";
	defaultPath: string;
}

export function directoryDialogOptions(request: unknown): OpenDialogOptions {
	if (typeof request !== "object" || request === null) throw new Error("Invalid folder request.");
	if (!("purpose" in request) || !("defaultPath" in request)) throw new Error("Invalid folder request.");
	const { purpose, defaultPath } = request;
	if (purpose !== "location" && purpose !== "add" && purpose !== "open") throw new Error("Invalid folder action.");
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
		buttonLabel: purpose === "location" ? "Choose location" : purpose === "add" ? "Add spool here" : "Open project",
		message:
			purpose === "location"
				? "Choose where to save projects."
				: purpose === "add"
					? "Add a design folder inside the selected folder."
					: "Choose a folder that already has a Spool project.",
		properties: purpose === "open" ? ["openDirectory"] : ["openDirectory", "createDirectory"],
	};
}
