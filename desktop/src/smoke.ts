import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { app, BrowserWindow, WebContentsView } from "electron";
import { status } from "./daemon";
import { buildAppMenu, buildTrayMenu, trayImage } from "./main";
import { installProjectDownloads } from "./project-download";
import { UpdateCover } from "./update-cover";
import { beginUpdateRestart } from "./update-restart";

// The check CI runs on macOS, and the only one that needs a real Electron.
//
// It proves three things a unit test cannot: the main process module loads under
// Electron at all, the menus this app builds are ones Electron accepts (a bad
// role or accelerator throws here rather than on somebody's Dock), and the
// daemon probe answers "nothing running" for a state directory that has never
// held a daemon. Everything else about the app is behavior around those.

async function checkProjectDownloads(directory: string): Promise<void> {
	const downloads = join(directory, "Downloads");
	mkdirSync(downloads);
	const previous = app.getPath("downloads");
	app.setPath("downloads", downloads);
	writeFileSync(join(downloads, "Example.spool"), "existing project");
	const server = createServer((request, response) => {
		if (request.url === "/") {
			response.writeHead(200, { "Content-Type": "text/html" });
			response.end("<!doctype html><title>Canvas download check</title>");
			return;
		}
		response.writeHead(200, {
			"Content-Type": "application/octet-stream",
			"Content-Disposition": 'attachment; filename="Example.spool"',
		});
		response.end("exported project");
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert(address !== null && typeof address !== "string");
	const origin = `http://127.0.0.1:${address.port}`;
	const canvas = new BrowserWindow({ show: false, webPreferences: { partition: `spool-download-${Date.now()}` } });
	try {
		installProjectDownloads(
			canvas.webContents.session,
			() => app.getPath("downloads"),
			(contents, candidate) => contents === canvas.webContents && candidate.startsWith(`blob:${origin}/`),
		);
		await canvas.loadURL(origin);
		await new Promise<void>((resolve, reject) => {
			let completed = 0;
			const deadline = setTimeout(
				() => reject(new Error("project download did not finish without a Save dialog")),
				10_000,
			);
			canvas.webContents.session.on("will-download", (_event, item) => {
				assert(item.getSavePath().startsWith(`${downloads}/.spool-download-`));
				item.once("done", (_done, state) => {
					if (state !== "completed") {
						clearTimeout(deadline);
						reject(new Error(`project download ${state}`));
					} else if (++completed === 2) {
						clearTimeout(deadline);
						resolve();
					}
				});
			});
			void canvas.webContents
				.executeJavaScript(`
				for (let index = 0; index < 2; index++) {
					const anchor = document.createElement("a");
					anchor.href = URL.createObjectURL(new Blob(["exported project"]));
					anchor.download = "Example.spool";
					anchor.click();
				}
			`)
				.catch(reject);
		});
		assert.deepEqual(readdirSync(downloads).sort(), ["Example (1).spool", "Example (2).spool", "Example.spool"]);
		assert.equal(readFileSync(join(downloads, "Example.spool"), "utf8"), "existing project");
		for (const name of ["Example (1).spool", "Example (2).spool"])
			assert.equal(readFileSync(join(downloads, name), "utf8"), "exported project");
	} finally {
		canvas.destroy();
		server.close();
		app.setPath("downloads", previous);
	}
}

async function checkProjectOpening(directory: string): Promise<void> {
	const state = join(directory, "file-open");
	mkdirSync(state);
	const cold = join(state, "Cold.spool");
	const warm = join(state, "Warm.spool");
	writeFileSync(cold, "cold archive");
	writeFileSync(warm, "warm archive");
	const imports: string[] = [];
	const sessions: unknown[] = [];
	const server = createServer(async (request, response) => {
		if (request.url === "/api/health") {
			response.end(
				JSON.stringify({
					name: "spool",
					version: "999.0.0",
					pid: process.pid,
					startedAt: new Date().toISOString(),
				}),
			);
			return;
		}
		if (request.url?.startsWith("/api/projects/import?") || request.url === "/api/session") {
			assert.equal(request.headers["x-spool-control"], "smoke-control");
			const chunks: Buffer[] = [];
			for await (const chunk of request) chunks.push(Buffer.from(chunk));
			const body = Buffer.concat(chunks).toString();
			if (request.url === "/api/session") {
				sessions.push(JSON.parse(body));
				response.writeHead(204).end();
			} else {
				imports.push(body);
				const name = imports.length === 1 ? "cold" : "warm";
				response.end(JSON.stringify({ root: `/projects/${name}`, name }));
			}
			return;
		}
		response.writeHead(200, { "Content-Type": "text/html" });
		response.end("<!doctype html><title>Native project open check</title>");
	});
	await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	assert(address !== null && typeof address !== "string");
	writeFileSync(
		join(state, "daemon.json"),
		JSON.stringify({
			pid: process.pid,
			host: "127.0.0.1",
			port: address.port,
			version: "999.0.0",
			startedAt: new Date().toISOString(),
			controlToken: "smoke-control",
		}),
	);
	const entry = join(state, "open.cjs");
	writeFileSync(
		entry,
		`
		const { app } = require("electron");
		const { boot } = require(${JSON.stringify(join(__dirname, "main.js"))});
		app.on("browser-window-created", (_event, window) => {
			window.webContents.on("did-finish-load", () => {
				const url = window.webContents.getURL();
				if (url.endsWith("/p/cold")) {
					setTimeout(() => {
						window.close();
						app.emit("open-file", { preventDefault() {} }, ${JSON.stringify(warm)});
					}, 50);
				}
				if (url.endsWith("/p/warm")) app.exit(0);
			});
		});
		boot();
		if (app.isReady()) throw new Error("cold file was not sent before ready");
		app.emit("open-file", { preventDefault() {} }, ${JSON.stringify(cold)});
	`,
	);
	try {
		await new Promise<void>((resolve, reject) => {
			const child = spawn(process.execPath, [entry], { env: { ...process.env, SPOOL_DIR: state }, stdio: "pipe" });
			let errors = "";
			child.stderr?.on("data", (chunk: Buffer) => {
				errors += chunk.toString();
			});
			const deadline = setTimeout(() => {
				child.kill();
				reject(
					new Error(
						`native project opening timed out: ${errors}\n${readFileSync(join(state, "app.log"), "utf8")}\n${JSON.stringify(imports)}`,
					),
				);
			}, 20_000);
			child.once("error", reject);
			child.once("exit", (code) => {
				clearTimeout(deadline);
				if (code === 0) resolve();
				else reject(new Error(`native project opening exited ${code}: ${errors}`));
			});
		});
		assert.deepEqual(imports, ["cold archive", "warm archive"]);
		assert.deepEqual(sessions, [
			{ root: "/projects/cold", open: true },
			{ root: "/projects/warm", open: true },
		]);
	} finally {
		server.close();
	}
}

async function checkUpdateCover(): Promise<void> {
	const canvas = new BrowserWindow({ width: 1000, height: 700, backgroundColor: "#0e0e0e" });
	try {
		await canvas.loadURL("data:text/html,<body style='background:%23222222'>Saved canvas</body>");
		const cover = new UpdateCover(canvas);
		await cover.enter();
		const surface = canvas.contentView.children.find((child) => child instanceof WebContentsView);
		assert(surface instanceof WebContentsView);
		const contents = surface.webContents;
		assert.equal(await contents.executeJavaScript("getComputedStyle(document.querySelector('main')).opacity"), "1");
		const before = await contents.executeJavaScript(
			"getComputedStyle(document.querySelector('.activity'),'::after').transform",
		);
		await canvas.loadURL("data:text/html,<body>Replacement canvas</body>");
		canvas.setContentSize(900, 600);
		await new Promise((resolve) => setTimeout(resolve, 10_000));
		assert.deepEqual(surface.getBounds(), { x: 0, y: 0, width: 900, height: 600 });
		const after = await contents.executeJavaScript(
			"getComputedStyle(document.querySelector('.activity'),'::after').transform",
		);
		assert.notEqual(before, after);
		assert.equal(await contents.executeJavaScript("document.querySelector('h1').textContent"), "Updating spool");
		if (process.env.SPOOL_FOLD_CAPTURE)
			writeFileSync(process.env.SPOOL_FOLD_CAPTURE, (await contents.capturePage()).toPNG());
		const destroyed = new Promise<void>((resolve) => contents.once("destroyed", () => resolve()));
		await cover.reveal();
		await destroyed;
		assert.equal(contents.isDestroyed(), true);
		assert.equal(canvas.contentView.children.length, 0);
		const reduced = new UpdateCover(canvas, true);
		const reducedSurface = canvas.contentView.children.find((child) => child instanceof WebContentsView);
		assert(reducedSurface instanceof WebContentsView);
		reducedSurface.webContents.debugger.attach("1.3");
		await reducedSurface.webContents.debugger.sendCommand("Emulation.setEmulatedMedia", {
			features: [{ name: "prefers-reduced-motion", value: "reduce" }],
		});
		await reduced.enter();
		assert.equal(
			await reducedSurface.webContents.executeJavaScript(
				"getComputedStyle(document.querySelector('.activity'),'::after').animationName",
			),
			"none",
		);
		await reducedSurface.webContents.executeJavaScript(
			"document.querySelector('canvas').getContext('webgl')?.getExtension('WEBGL_lose_context')?.loseContext()",
		);
		await reduced.reveal();
		assert.equal(canvas.contentView.children.length, 0);
	} finally {
		canvas.destroy();
	}
}

async function run(): Promise<void> {
	const directory = mkdtempSync(join(tmpdir(), "spool-desktop-smoke-"));
	try {
		await checkUpdateCover();
		await checkProjectOpening(directory);
		await checkProjectDownloads(directory);
		const empty = await status(directory);
		if (empty.running) throw new Error(`an empty state directory reported a running daemon`);

		const image = trayImage();
		if (image.isEmpty()) throw new Error("the tray mark is missing from the bundle");

		if (buildAppMenu().items.length === 0) throw new Error("the application menu is empty");
		if (buildTrayMenu().items.length === 0) throw new Error("the tray menu is empty");

		// Launch the actual entry point while an older app must stay out of ShipIt's
		// way. No fake app events: a real second Electron process must exit without
		// opening the canvas, spawning the daemon, or consuming the handoff.
		beginUpdateRestart(directory, "999.0.0");
		await new Promise<void>((resolve, reject) => {
			const child = spawn(process.execPath, [join(__dirname, "index.js")], {
				env: { ...process.env, SPOOL_DIR: directory },
				stdio: "ignore",
			});
			const deadline = setTimeout(() => {
				child.kill();
				reject(new Error("old app did not exit during update handoff"));
			}, 10_000);
			child.once("error", (error) => {
				clearTimeout(deadline);
				reject(error);
			});
			child.once("exit", (code) => {
				clearTimeout(deadline);
				if (code === 0) resolve();
				else reject(new Error(`handoff launch exited ${code}`));
			});
		});
		const lines = readFileSync(join(directory, "app.log"), "utf8");
		assert.match(lines, /waiting for native replacement/);
		assert.doesNotMatch(lines, /\tboot\t|\tdaemon\t/);
		assert.equal(existsSync(join(directory, "daemon.json")), false);
		assert.equal(existsSync(join(directory, "app-update-restart.json")), true);

		process.stdout.write(`smoke ok — electron ${process.versions.electron}\n`);
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
}

app.on("window-all-closed", () => {});

void app.whenReady().then(async () => {
	try {
		await run();
		app.exit(0);
	} catch (error) {
		process.stderr.write(`smoke failed: ${(error as Error).message}\n`);
		app.exit(1);
	}
});
