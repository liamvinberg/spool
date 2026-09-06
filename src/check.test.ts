import { mkdirSync, symlinkSync, truncateSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { dirname, join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { checkSourceLimits } from "./check-budget";
import { messages } from "./check-test-harness";
import { makeTempDir, markProject, writeFrame } from "./test-helpers";

describe("offline design checking", () => {
	it("returns clean when a project has no HTML frames", () => {
		const root = makeTempDir();
		markProject(root);

		expect(messages(root)).toEqual([]);
	});

	it("reports a regular file at design/frames instead of treating it as an empty project", () => {
		const root = makeTempDir();
		markProject(root);
		writeFileSync(join(root, "design", "frames"), "not a directory\n");

		expect(messages(root)).toEqual(["design/frames:1:1 TS5083: Filesystem read failed (ENOTDIR)"]);
	});

	it("rejects an escaped frames directory before enumerating it", () => {
		const root = makeTempDir();
		markProject(root);
		const outside = join(root, "outside-frames");
		mkdirSync(join(outside, "secret"), { recursive: true });
		writeFileSync(join(outside, "secret", "frame.tsx"), "outsideSecret();\n");
		symlinkSync(outside, join(root, "design", "frames"), "dir");

		const result = messages(root);

		expect(result).toEqual(["design/frames:1:1 TS5083: Design boundary prevents checking this project"]);
		expect(result.join("\n")).not.toContain("secret");
		expect(result.join("\n")).not.toContain(root);
	});

	it("reports unreadable source shapes instead of returning clean", () => {
		const root = makeTempDir();
		markProject(root);
		mkdirSync(join(root, "design", "frames", "home", "frame.tsx"), { recursive: true });

		expect(messages(root)).toEqual(["design/frames:1:1 TS5083: Filesystem read failed (EISDIR)"]);
	});

	it("refuses a socket frame without opening it", async () => {
		const root = makeTempDir();
		markProject(root);
		const frame = join(root, "design", "frames", "home", "frame.tsx");
		mkdirSync(dirname(frame), { recursive: true });
		const socket = createServer();
		await new Promise<void>((ready, reject) => {
			socket.once("error", reject);
			socket.listen(frame, ready);
		});
		onTestFinished(() => new Promise<void>((done) => socket.close(() => done())));

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:1 TS5083: Filesystem read refused (non-regular file)",
		]);
	});

	it("refuses a socket source with one importer-local diagnostic", async () => {
		const root = makeTempDir();
		markProject(root);
		const source = join(root, "design", "shared", "value.ts");
		mkdirSync(dirname(source), { recursive: true });
		const socket = createServer();
		await new Promise<void>((ready, reject) => {
			socket.once("error", reject);
			socket.listen(source, ready);
		});
		onTestFinished(() => new Promise<void>((done) => socket.close(() => done())));
		writeFrame(root, "home", 'import { value } from "../../shared/value";\nvoid value;\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:23 TS2307: Filesystem read refused (non-regular file)",
		]);
	});

	it("refuses a socket import map without opening it", async () => {
		const root = makeTempDir();
		markProject(root);
		const importMap = join(root, "design", "shared", "importmap.json");
		mkdirSync(dirname(importMap), { recursive: true });
		const socket = createServer();
		await new Promise<void>((ready, reject) => {
			socket.once("error", reject);
			socket.listen(importMap, ready);
		});
		onTestFinished(() => new Promise<void>((done) => socket.close(() => done())));
		writeFrame(root, "home", "export default function Home() { return <main />; }\n");

		expect(messages(root)).toEqual([
			"design/shared/importmap.json:1:1 TS5083: Filesystem read refused (non-regular file)",
		]);
	});

	it("fails closed with one diagnostic when a source exceeds the offline-check budget", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", "export default function Home() { return <main />; }\n");
		truncateSync(join(root, "design", "frames", "home", "frame.tsx"), checkSourceLimits.maxFileBytes + 1);

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:1:1 TS5083: Offline check resource limit exceeded",
		]);
	});

	it("keeps TypeScript's internally reached React, DOM, and spool declarations available", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			'import { useState } from "react";\nimport { ui } from "spool";\nconst node: HTMLElement = document.createElement("div");\nexport default function Home() { const [value] = useState(1); ui.go("next"); return <p>{node.tagName}{value}</p>; }\n',
		);

		expect(messages(root)).toEqual([]);
	});

	it("types ui.copy as a Promise<void> clipboard write", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(
			root,
			"home",
			'import { ui } from "spool";\nconst copied: Promise<void> = ui.copy("invite link");\nvoid copied;\n',
		);

		expect(messages(root)).toEqual([]);
	});

	it("requires ui.copy text to be a string", () => {
		const root = makeTempDir();
		markProject(root);
		writeFrame(root, "home", 'import { ui } from "spool";\nui.copy(42);\n');

		expect(messages(root)).toEqual([
			"design/frames/home/frame.tsx:2:9 TS2345: Argument of type 'number' is not assignable to parameter of type 'string'.",
		]);
	});
});
