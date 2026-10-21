import { deepEqual, equal, throws } from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { directoryDialogOptions } from "./directory-dialog";

test("native folder actions use the selected directory and allow making folders only for setup", () => {
	for (const purpose of ["location", "add", "open"]) {
		const options = directoryDialogOptions({ purpose, defaultPath: "~/spool" });
		equal(options.defaultPath, join(homedir(), "spool"));
		deepEqual(options.properties, purpose === "open" ? ["openDirectory"] : ["openDirectory", "createDirectory"]);
	}
	equal(directoryDialogOptions({ purpose: "open", defaultPath: "~" }).defaultPath, homedir());
	equal(directoryDialogOptions({ purpose: "add", defaultPath: "/tmp/my codebase" }).defaultPath, "/tmp/my codebase");
});

test("an export asks for the folder it is written into", () => {
	const options = directoryDialogOptions({ purpose: "export", defaultPath: "~/Downloads" });
	equal(options.buttonLabel, "Export here");
	equal(options.message, "Choose the folder the export is written into.");
	deepEqual(options.properties, ["openDirectory", "createDirectory"]);
});

test("rejects malformed requests from the renderer", () => {
	for (const request of [
		null,
		{},
		{ purpose: "delete", defaultPath: "~" },
		{ purpose: "open", defaultPath: 2 },
		{ purpose: "open", defaultPath: "relative" },
		{ purpose: "open", defaultPath: "/tmp/\0" },
	]) {
		throws(() => directoryDialogOptions(request));
	}
});
