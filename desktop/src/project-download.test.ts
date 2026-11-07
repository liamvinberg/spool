import { deepEqual, equal } from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type TestContext, test } from "node:test";
import type { DownloadItem, Session, WebContents } from "electron";
import { installCanvasDownloads } from "./project-download";

// A stand-in for Electron's download: it writes its body where it was told to and says how it ended.
class Item extends EventEmitter {
	savePath: string | undefined;
	constructor(
		readonly filename: string,
		readonly body = "exported",
	) {
		super();
	}
	getFilename = () => this.filename;
	getURL = () => "blob:http://127.0.0.1:7767/x";
	setSavePath = (path: string) => {
		this.savePath = path;
	};
	cancel = () => {};
	finish(state: "completed" | "cancelled" = "completed") {
		if (state === "completed" && this.savePath !== undefined) writeFileSync(this.savePath, this.body);
		this.emit("done", {}, state);
	}
}

function canvas(t: TestContext) {
	const session = new EventEmitter();
	const sent: [string, unknown][] = [];
	const contents = {
		isDestroyed: () => false,
		send: (channel: string, value: unknown) => sent.push([channel, value]),
	};
	const downloads = mkdtempSync(join(tmpdir(), "spool-downloads-"));
	t.after(() => rmSync(downloads, { recursive: true }));
	const saved = installCanvasDownloads(
		session as unknown as Session,
		() => downloads,
		(from) => from === (contents as unknown as WebContents),
	);
	const download = (item: Item, from: unknown = contents) => {
		session.emit("will-download", {}, item as unknown as DownloadItem, from);
		return item;
	};
	return { downloads, sent, saved, download };
}

test("a frame export lands in Downloads beside a file of its name, and the canvas hears where", (t) => {
	const c = canvas(t);
	writeFileSync(join(c.downloads, "kaffe-checkout.html"), "older");
	c.download(new Item("kaffe-checkout.html", "<html>")).finish();
	c.download(new Item("kaffe-checkout.png", "png")).finish();
	deepEqual(readdirSync(c.downloads).sort(), ["kaffe-checkout (1).html", "kaffe-checkout.html", "kaffe-checkout.png"]);
	equal(readFileSync(join(c.downloads, "kaffe-checkout.html"), "utf8"), "older");
	equal(readFileSync(join(c.downloads, "kaffe-checkout (1).html"), "utf8"), "<html>");
	deepEqual(c.sent[0], [
		"spool:export-download",
		{
			status: "completed",
			requested: "kaffe-checkout.html",
			filename: "kaffe-checkout (1).html",
			path: join(c.downloads, "kaffe-checkout (1).html"),
		},
	]);
	// only what this app saved may be revealed
	equal(c.saved.saved(join(c.downloads, "kaffe-checkout (1).html")), true);
	equal(c.saved.saved(join(c.downloads, "kaffe-checkout.html")), false);
	equal(c.saved.saved(join(c.downloads, "..", "kaffe-checkout (1).html")), false);
	equal(c.saved.saved(42), false);
});

test("an export that does not finish is reported by the name the canvas asked for", (t) => {
	const c = canvas(t);
	c.download(new Item("Deck.pdf")).finish("cancelled");
	deepEqual(c.sent, [
		[
			"spool:export-download",
			{
				status: "failed",
				requested: "Deck.pdf",
				message: "The export download did not finish. Try exporting again.",
			},
		],
	]);
	deepEqual(readdirSync(c.downloads), []);
});

test("a project keeps its own report, and other downloads are left to Electron", (t) => {
	const c = canvas(t);
	c.download(new Item("Example.spool")).finish();
	deepEqual(c.sent, [["spool:project-download", { status: "completed", filename: "Example.spool" }]]);
	equal(c.download(new Item("notes.txt")).savePath, undefined);
	equal(c.download(new Item("frame.html"), { isDestroyed: () => false }).savePath, undefined);
});
