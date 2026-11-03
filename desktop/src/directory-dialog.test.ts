import { deepEqual, equal, throws } from "node:assert/strict";
import { homedir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { directoryDialogOptions } from "./directory-dialog";

test("open takes a folder or a .spool file, and a location a folder it may make", () => {
	const open = directoryDialogOptions({ purpose: "open", defaultPath: "~" });
	equal(open.defaultPath, homedir());
	deepEqual(open.properties, ["openDirectory", "openFile"]);
	deepEqual(open.filters, [{ name: "spool project", extensions: ["spool"] }]);
	const location = directoryDialogOptions({ purpose: "location", defaultPath: "~/spool" });
	equal(location.defaultPath, join(homedir(), "spool"));
	deepEqual(location.properties, ["openDirectory", "createDirectory"]);
	equal(directoryDialogOptions({ purpose: "location", defaultPath: "/tmp/my code" }).defaultPath, "/tmp/my code");
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
		{ purpose: "add", defaultPath: "~" },
		{ purpose: "open", defaultPath: 2 },
		{ purpose: "open", defaultPath: "relative" },
		{ purpose: "open", defaultPath: "/tmp/\0" },
	]) {
		throws(() => directoryDialogOptions(request));
	}
});
