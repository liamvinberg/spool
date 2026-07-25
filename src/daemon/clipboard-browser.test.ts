import { join } from "node:path";
import { type Browser, chromium, type Frame, type Page } from "playwright-core";
import { build as buildUi } from "vite";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, serveProject, writeDesignFile, writeFrame } from "../test-helpers";
import { terminalSourceVersion } from "./term-source";

async function launchBrowser(): Promise<Browser | undefined> {
	try {
		return await chromium.launch({ channel: "chromium-headless-shell", headless: true });
	} catch {
		return undefined;
	}
}

async function childFrame(page: Page, selector: string): Promise<Frame> {
	const element = await page.waitForSelector(selector);
	const frame = await element.contentFrame();
	if (frame === null) throw new Error(`${selector} has no content frame`);
	return frame;
}

const clipboardFrame = `import { useState } from "react";
import { ui } from "spool";

export default function ClipboardFrame() {
	const [result, setResult] = useState("idle");
	async function copy() {
		setResult("writing");
		try {
			await ui.copy("canvas clipboard value");
			setResult("copied");
		} catch (error) {
			const value = error as { name?: unknown; message?: unknown };
			setResult(String(value.name) + ":" + String(value.message));
		}
	}
	return (
		<main>
			<button id="copy" onClick={() => void copy()}>copy</button>
			<output id="result">{result}</output>
		</main>
	);
}
`;

const navigationClipboardFrame = `import { ui } from "spool";

export default function NavigationClipboardFrame() {
	async function leaveThenCopy() {
		const probe = window as unknown as { __copyRace: string };
		probe.__copyRace = "pending";
		ui.go("other");
		try {
			await ui.copy("must not write");
			probe.__copyRace = "copied";
		} catch (error) {
			const value = error as { name?: unknown; message?: unknown };
			probe.__copyRace = String(value.name) + ":" + String(value.message);
		}
	}
	return <button id="leave-then-copy" onClick={() => void leaveThenCopy()}>leave</button>;
}
`;

const terminalNavigationClipboardFrame = `import { ui } from "spool";

const probe = window as unknown as { __terminalCopy?: string };
probe.__terminalCopy = "idle";

export default function TerminalNavigationClipboardFrame() {
	async function leaveThenCopy() {
		probe.__terminalCopy = "pending";
		ui.go("dash");
		const deadline = performance.now() + 3_000;
		while (document.querySelector(".spool-term-screen") === null && performance.now() < deadline) {
			await new Promise((resolve) => setTimeout(resolve, 10));
		}
		await new Promise((resolve) => setTimeout(resolve, 150));
		try {
			await ui.copy("must not write from a terminal frame");
			probe.__terminalCopy = "copied";
		} catch (error) {
			const value = error as { name?: unknown; message?: unknown };
			probe.__terminalCopy = String(value.name) + ":" + String(value.message);
		}
	}
	return <button id="to-terminal" onClick={() => void leaveThenCopy()}>terminal</button>;
}
`;

const warmNavigationClipboardFrame = `import { useState } from "react";
import { ui } from "spool";

const probe = window as unknown as {
	__warmBoots?: number;
	__ignoredCopy?: string;
	__copyWhileUnentered?: () => Promise<string>;
};
probe.__warmBoots = (probe.__warmBoots ?? 0) + 1;
probe.__ignoredCopy = "pending";
ui.go("other");
void ui.copy("ignored warm copy").then(
	() => { probe.__ignoredCopy = "copied"; },
	(error: unknown) => {
		const value = error as { name?: unknown; message?: unknown };
		probe.__ignoredCopy = String(value.name) + ":" + String(value.message);
	},
);
probe.__copyWhileUnentered = async () => {
	try {
		await ui.copy("must not write while unentered");
		return "copied";
	} catch (error) {
		const value = error as { name?: unknown; message?: unknown };
		return String(value.name) + ":" + String(value.message);
	}
};

export default function WarmNavigationClipboardFrame() {
	const [result, setResult] = useState("idle");
	async function copy() {
		setResult("writing");
		try {
			await ui.copy("warm frame clipboard value");
			setResult("copied");
		} catch (error) {
			const value = error as { name?: unknown; message?: unknown };
			setResult(String(value.name) + ":" + String(value.message));
		}
	}
	function goOther() {
		setResult("walking");
		ui.go("other");
	}
	function goMissing() {
		setResult("missing");
		ui.go("missing");
	}
	function terminalMissing() {
		setResult("terminal missing");
		window.parent.postMessage({ spool: "go", frame: "warm", target: "missing" }, "*");
	}
	return (
		<main>
			<button id="copy" onClick={() => void copy()}>copy</button>
			<button id="go-other" onClick={() => goOther()}>go</button>
			<button id="go-missing" onClick={() => goMissing()}>missing</button>
			<button id="terminal-missing" onClick={() => terminalMissing()}>terminal missing</button>
			<output id="result">{result}</output>
		</main>
	);
}
`;

const selfWalkClipboardFrame = `import { useState } from "react";
import { ui } from "spool";

const probe = window as unknown as {
	__documentId?: string;
	__selfCopy?: string;
	__walkDecisions?: Array<{ accepted: boolean; reason?: string }>;
};
probe.__documentId = crypto.randomUUID();
probe.__selfCopy = "idle";
probe.__walkDecisions = [];
window.addEventListener("message", (event) => {
	const message = event.data as { spool?: unknown; accepted?: unknown; reason?: unknown };
	if (message?.spool !== "walk-decision") return;
	probe.__walkDecisions?.push(
		message.accepted === true
			? { accepted: true }
			: { accepted: false, reason: typeof message.reason === "string" ? message.reason : undefined },
	);
});

export default function SelfWalkClipboardFrame() {
	const [result, setResult] = useState("idle");
	async function copy() {
		setResult("writing");
		try {
			await ui.copy("self walk clipboard value");
			setResult("copied");
		} catch (error) {
			const value = error as { name?: unknown; message?: unknown };
			setResult(String(value.name) + ":" + String(value.message));
		}
	}
	async function selfWalk() {
		probe.__selfCopy = "pending";
		ui.go("self");
		await new Promise((resolve) => setTimeout(resolve, 50));
		ui.go("self");
		await new Promise((resolve) => setTimeout(resolve, 50));
		try {
			await ui.copy("must not write before self reboot");
			probe.__selfCopy = "copied";
		} catch (error) {
			const value = error as { name?: unknown; message?: unknown };
			probe.__selfCopy = String(value.name) + ":" + String(value.message);
		}
	}
	function forgedTerminalSelfWalk() {
		window.parent.postMessage({ spool: "go", frame: "self", target: "self" }, "*");
	}
	return (
		<main>
			<button id="forged-terminal-walk" onClick={() => forgedTerminalSelfWalk()}>forged terminal walk</button>
			<button id="self-walk" onClick={() => void selfWalk()}>self walk</button>
			<button id="copy" onClick={() => void copy()}>copy</button>
			<output id="result">{result}</output>
		</main>
	);
}
`;

it("copies from real canvas and player clicks over their trusted transports", { timeout: 90_000 }, async () => {
	const browser = await launchBrowser();
	if (browser === undefined) return;
	onTestFinished(() => browser.close());

	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "clipboard", clipboardFrame);
	writeFrame(project.root, "other", "export default function Other() { return <main>other</main> }");
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const session = await fetch(`${project.url}/api/session`, {
		method: "PUT",
		headers: {
			"content-type": "application/json",
			"X-Spool-Control": project.controlToken,
		},
		body: JSON.stringify({ root: project.root, open: true }),
	});
	expect(session.status).toBe(204);

	const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
	onTestFinished(() => context.close());
	await context.grantPermissions(["clipboard-read", "clipboard-write"], {
		origin: new URL(project.url).origin,
	});
	const page = await context.newPage();
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const label = page.locator('[data-frame-label="clipboard"]');
	await label.dispatchEvent("dblclick");
	await expect.poll(() => label.innerText()).toContain("esc exits");
	const frame = await childFrame(page, 'iframe[title="clipboard"]');
	await frame.locator("#copy").waitFor();
	await expect
		.poll(() =>
			page.locator('iframe[title="clipboard"]').evaluate((element) => getComputedStyle(element).pointerEvents),
		)
		.toBe("auto");
	await page.waitForTimeout(300);

	const copyBox = await frame.locator("#copy").boundingBox();
	if (copyBox === null) throw new Error("copy button has no box");
	await page.mouse.click(copyBox.x + copyBox.width / 2, copyBox.y + copyBox.height / 2);
	await expect.poll(() => frame.locator("#result").innerText()).toBe("copied");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("canvas clipboard value");

	await page.evaluate(() => navigator.clipboard.writeText("ownership baseline"));
	await frame.evaluate(() => {
		window.parent.postMessage({ spool: "copy", frame: "other", id: 7001, text: "forged owner" }, "*");
		window.parent.postMessage({ spool: "copy", frame: "clipboard", id: 7002, text: "extra key", extra: true }, "*");
	});
	await page.waitForTimeout(100);
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("ownership baseline");

	const player = await context.newPage();
	await player.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=clipboard`);
	const playerFrame = await childFrame(player, "#spool-player");
	await playerFrame.locator("#copy").waitFor();
	await expect
		.poll(() => player.locator("#spool-player").evaluate((element) => getComputedStyle(element).visibility))
		.toBe("visible");

	const playerCopyBox = await playerFrame.locator("#copy").boundingBox();
	if (playerCopyBox === null) throw new Error("player copy button has no box");
	await player.evaluate(() => navigator.clipboard.writeText("player copy baseline"));
	await player.mouse.click(playerCopyBox.x + playerCopyBox.width / 2, playerCopyBox.y + playerCopyBox.height / 2);
	await expect.poll(() => playerFrame.locator("#result").innerText()).toBe("copied");
	expect(await player.evaluate(() => navigator.clipboard.readText())).toBe("canvas clipboard value");

	await player.evaluate(() => navigator.clipboard.writeText("player public baseline"));
	await playerFrame.evaluate(() => {
		window.parent.postMessage({ spool: "copy", frame: "clipboard", id: 7003, text: "public player forgery" }, "*");
	});
	await player.waitForTimeout(100);
	expect(await player.evaluate(() => navigator.clipboard.readText())).toBe("player public baseline");
});

it("rejects retained html clipboard writes after the player enters a terminal frame", { timeout: 90_000 }, async () => {
	const browser = await launchBrowser();
	if (browser === undefined) return;
	onTestFinished(() => browser.close());

	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "start", terminalNavigationClipboardFrame);
	writeDesignFile(project.root, "frames/dash/term.tsx", "// execution disabled until OS-sandboxed\n");
	writeDesignFile(
		project.root,
		".spool/term/dash.screen",
		`${JSON.stringify({
			cols: 80,
			rows: 24,
			screen: "terminal clipboard boundary",
			sourceVersion: terminalSourceVersion(project.root, "dash"),
		})}\n`,
	);
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	await context.grantPermissions(["clipboard-read", "clipboard-write"], {
		origin: new URL(project.url).origin,
	});
	const page = await context.newPage();
	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const frame = await childFrame(page, "#spool-player");
	await frame.locator("#to-terminal").waitFor();
	await page.evaluate(() => navigator.clipboard.writeText("terminal boundary baseline"));
	await frame.locator("#to-terminal").click();
	await frame.locator(".spool-term-screen").waitFor();

	await expect
		.poll(() => frame.evaluate(() => (window as unknown as { __terminalCopy?: string }).__terminalCopy))
		.toBe("NotSupportedError:Clipboard writes require an HTML frame");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("terminal boundary baseline");
});

it("can copy after the canvas ignores an automatic walk from the same warm frame", { timeout: 90_000 }, async () => {
	const browser = await launchBrowser();
	if (browser === undefined) return;
	onTestFinished(() => browser.close());

	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "warm", warmNavigationClipboardFrame);
	writeFrame(project.root, "other", "export default function Other() { return <main>other</main> }");
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const session = await fetch(`${project.url}/api/session`, {
		method: "PUT",
		headers: {
			"content-type": "application/json",
			"X-Spool-Control": project.controlToken,
		},
		body: JSON.stringify({ root: project.root, open: true }),
	});
	expect(session.status).toBe(204);

	const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
	onTestFinished(() => context.close());
	await context.grantPermissions(["clipboard-read", "clipboard-write"], {
		origin: new URL(project.url).origin,
	});
	const page = await context.newPage();
	await page.addInitScript(() => {
		if (window.top !== window) return;
		const received: unknown[] = [];
		Object.defineProperty(window, "__spoolWarmMessages", { value: received });
		window.addEventListener("message", (event) => received.push(event.data));
	});
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const label = page.locator('[data-frame-label="warm"]');
	const frame = await childFrame(page, 'iframe[title="warm"]');
	await frame.locator("#copy").waitFor();
	await page.waitForTimeout(100);
	expect(await label.innerText()).not.toContain("esc exits");
	expect(await page.locator('[data-frame-label="other"]').innerText()).not.toContain("esc exits");
	expect(await frame.evaluate(() => (window as unknown as { __warmBoots?: number }).__warmBoots)).toBe(1);
	await expect
		.poll(() => frame.evaluate(() => (window as unknown as { __ignoredCopy?: string }).__ignoredCopy))
		.toBe("AbortError:Clipboard request interrupted by navigation");
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { __spoolWarmMessages: unknown[] }).__spoolWarmMessages.filter(
					(message) =>
						typeof message === "object" && message !== null && "spool" in message && message.spool === "copy",
				).length,
		),
	).toBe(0);

	await label.dispatchEvent("dblclick");
	await expect.poll(() => label.innerText()).toContain("esc exits");
	expect(await frame.evaluate(() => (window as unknown as { __warmBoots?: number }).__warmBoots)).toBe(1);
	await expect
		.poll(() => page.locator('iframe[title="warm"]').evaluate((element) => getComputedStyle(element).pointerEvents))
		.toBe("auto");
	await page.waitForTimeout(300);
	const copyBox = await frame.locator("#copy").boundingBox();
	if (copyBox === null) throw new Error("warm copy button has no box");
	await page.mouse.click(copyBox.x + copyBox.width / 2, copyBox.y + copyBox.height / 2);

	await expect.poll(() => frame.locator("#result").innerText()).toBe("copied");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("warm frame clipboard value");

	const missingBox = await frame.locator("#go-missing").boundingBox();
	if (missingBox === null) throw new Error("missing walk button has no box");
	await page.mouse.click(missingBox.x + missingBox.width / 2, missingBox.y + missingBox.height / 2);
	await expect.poll(() => frame.locator("#result").innerText()).toBe("missing");
	await page.waitForTimeout(100);
	await page.evaluate(() => navigator.clipboard.writeText("missing walk baseline"));
	await page.mouse.click(copyBox.x + copyBox.width / 2, copyBox.y + copyBox.height / 2);
	await expect.poll(() => frame.locator("#result").innerText()).toBe("copied");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("warm frame clipboard value");

	const terminalMissingBox = await frame.locator("#terminal-missing").boundingBox();
	if (terminalMissingBox === null) throw new Error("terminal missing walk button has no box");
	await page.mouse.click(
		terminalMissingBox.x + terminalMissingBox.width / 2,
		terminalMissingBox.y + terminalMissingBox.height / 2,
	);
	await expect.poll(() => frame.locator("#result").innerText()).toBe("terminal missing");
	await page.waitForTimeout(100);
	expect(await label.innerText()).toContain("esc exits");
	await page.evaluate(() => navigator.clipboard.writeText("terminal missing baseline"));
	await page.mouse.click(copyBox.x + copyBox.width / 2, copyBox.y + copyBox.height / 2);
	await expect.poll(() => frame.locator("#result").innerText()).toBe("copied");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("warm frame clipboard value");

	const goBox = await frame.locator("#go-other").boundingBox();
	if (goBox === null) throw new Error("warm walk button has no box");
	await page.mouse.click(goBox.x + goBox.width / 2, goBox.y + goBox.height / 2);
	await expect.poll(() => page.locator('[data-frame-label="other"]').innerText()).toContain("esc exits");
	await page.waitForTimeout(100);
	await page.evaluate(() => navigator.clipboard.writeText("unentered source baseline"));
	expect(
		await frame.evaluate(
			async () =>
				await (
					window as unknown as {
						__copyWhileUnentered: () => Promise<string>;
					}
				).__copyWhileUnentered(),
		),
	).toBe("AbortError:Clipboard writes resume when this frame is entered again");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("unentered source baseline");

	await label.dispatchEvent("dblclick");
	await expect.poll(() => label.innerText()).toContain("esc exits");
	expect(await frame.evaluate(() => (window as unknown as { __warmBoots?: number }).__warmBoots)).toBe(1);

	await page.evaluate(() => navigator.clipboard.writeText("accepted walk baseline"));
	const resumedCopyBox = await frame.locator("#copy").boundingBox();
	if (resumedCopyBox === null) throw new Error("resumed warm copy button has no box");
	await page.mouse.click(resumedCopyBox.x + resumedCopyBox.width / 2, resumedCopyBox.y + resumedCopyBox.height / 2);
	await expect.poll(() => frame.locator("#result").innerText()).toBe("copied");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("warm frame clipboard value");
});

it("blocks self-walk clipboard writes until the frame document is replaced", { timeout: 90_000 }, async () => {
	const browser = await launchBrowser();
	if (browser === undefined) return;
	onTestFinished(() => browser.close());

	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "self", selfWalkClipboardFrame);
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const session = await fetch(`${project.url}/api/session`, {
		method: "PUT",
		headers: {
			"content-type": "application/json",
			"X-Spool-Control": project.controlToken,
		},
		body: JSON.stringify({ root: project.root, open: true }),
	});
	expect(session.status).toBe(204);

	const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => context.close());
	await context.grantPermissions(["clipboard-read", "clipboard-write"], {
		origin: new URL(project.url).origin,
	});
	const page = await context.newPage();
	await page.addInitScript(() => {
		if (window.top !== window) return;
		const received: unknown[] = [];
		Object.defineProperty(window, "__spoolSelfMessages", { value: received });
		window.addEventListener("message", (event) => received.push(event.data));
	});
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const label = page.locator('[data-frame-label="self"]');
	await label.dispatchEvent("dblclick");
	await expect.poll(() => label.innerText()).toContain("esc exits");
	const frame = await childFrame(page, 'iframe[title="self"]');
	await frame.locator("#self-walk").waitFor();
	await expect
		.poll(() => page.locator('iframe[title="self"]').evaluate((element) => getComputedStyle(element).pointerEvents))
		.toBe("auto");
	await expect
		.poll(() =>
			page.evaluate(() =>
				(window as unknown as { __spoolSelfMessages: unknown[] }).__spoolSelfMessages.some(
					(message) =>
						typeof message === "object" &&
						message !== null &&
						"spool" in message &&
						message.spool === "shot" &&
						"frame" in message &&
						message.frame === "self",
				),
			),
		)
		.toBe(true);
	const documentId = await frame.evaluate(() => (window as unknown as { __documentId?: string }).__documentId);
	const forgedWalkBox = await frame.locator("#forged-terminal-walk").boundingBox();
	if (forgedWalkBox === null) throw new Error("forged terminal walk button has no box");
	await page.mouse.click(forgedWalkBox.x + forgedWalkBox.width / 2, forgedWalkBox.y + forgedWalkBox.height / 2);
	await page.waitForTimeout(600);
	const afterForgedWalk = await childFrame(page, 'iframe[title="self"]');
	expect(await afterForgedWalk.evaluate(() => (window as unknown as { __documentId?: string }).__documentId)).toBe(
		documentId,
	);
	await page.evaluate(() => navigator.clipboard.writeText("forged terminal baseline"));
	const authorityCopyBox = await frame.locator("#copy").boundingBox();
	if (authorityCopyBox === null) throw new Error("post-forgery copy button has no box");
	await page.mouse.click(
		authorityCopyBox.x + authorityCopyBox.width / 2,
		authorityCopyBox.y + authorityCopyBox.height / 2,
	);
	await expect.poll(() => frame.locator("#result").innerText()).toBe("copied");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("self walk clipboard value");
	await frame.evaluate(() => {
		const nativeDecode = HTMLImageElement.prototype.decode;
		HTMLImageElement.prototype.decode = async function delayedDecode() {
			await new Promise((resolve) => setTimeout(resolve, 1_000));
			return nativeDecode.call(this);
		};
	});
	await page.evaluate(() => navigator.clipboard.writeText("self walk baseline"));
	const walkBox = await frame.locator("#self-walk").boundingBox();
	if (walkBox === null) throw new Error("self walk button has no box");
	await page.mouse.click(walkBox.x + walkBox.width / 2, walkBox.y + walkBox.height / 2);

	await expect
		.poll(() => frame.evaluate(() => (window as unknown as { __walkDecisions?: unknown[] }).__walkDecisions))
		.toEqual([{ accepted: true }, { accepted: false, reason: "inactive" }]);
	await expect
		.poll(() => frame.evaluate(() => (window as unknown as { __selfCopy?: string }).__selfCopy), {
			interval: 20,
			timeout: 350,
		})
		.toBe("AbortError:Clipboard writes resume when this frame is entered again");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("self walk baseline");

	await expect
		.poll(
			async () => {
				const current = await childFrame(page, 'iframe[title="self"]');
				return await current.evaluate(() => (window as unknown as { __documentId?: string }).__documentId);
			},
			{ timeout: 3_000 },
		)
		.not.toBe(documentId);
	const freshFrame = await childFrame(page, 'iframe[title="self"]');
	await freshFrame.locator("#copy").waitFor();
	await expect
		.poll(() => page.locator('iframe[title="self"]').evaluate((element) => getComputedStyle(element).pointerEvents))
		.toBe("auto");
	await page.waitForTimeout(300);
	const copyBox = await freshFrame.locator("#copy").boundingBox();
	if (copyBox === null) throw new Error("fresh self copy button has no box");
	await page.mouse.click(copyBox.x + copyBox.width / 2, copyBox.y + copyBox.height / 2);
	await expect.poll(() => freshFrame.locator("#result").innerText()).toBe("copied");
	expect(await page.evaluate(() => navigator.clipboard.readText())).toBe("self walk clipboard value");
});

it("rejects same-tick canvas and player copies when their walks have already begun", { timeout: 90_000 }, async () => {
	const browser = await launchBrowser();
	if (browser === undefined) return;
	onTestFinished(() => browser.close());

	const uiDir = join(makeTempDir(), "ui");
	const project = await serveProject({ uiDir });
	writeFrame(project.root, "start", navigationClipboardFrame);
	writeFrame(project.root, "other", 'export default function Other() { return <main id="other">other</main> }');
	await buildUi({
		configFile: join(process.cwd(), "vite.config.ts"),
		logLevel: "silent",
		build: { outDir: uiDir, emptyOutDir: true },
	});
	const session = await fetch(`${project.url}/api/session`, {
		method: "PUT",
		headers: {
			"content-type": "application/json",
			"X-Spool-Control": project.controlToken,
		},
		body: JSON.stringify({ root: project.root, open: true }),
	});
	expect(session.status).toBe(204);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	onTestFinished(() => page.close());
	await page.addInitScript(() => {
		if (window.top === window) {
			const received: unknown[] = [];
			Object.defineProperty(window, "__spoolCanvasMessages", { value: received });
			window.addEventListener("message", (event) => received.push(event.data));
			return;
		}
		const sent: unknown[] = [];
		const nativePostMessage = MessagePort.prototype.postMessage;
		Object.defineProperty(window, "__spoolPlayerMessages", { value: sent });
		Object.defineProperty(MessagePort.prototype, "postMessage", {
			configurable: true,
			value(this: MessagePort, message: unknown) {
				sent.push(message);
				nativePostMessage.call(this, message);
			},
		});
	});
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);
	const label = page.locator('[data-frame-label="start"]');
	await label.dispatchEvent("dblclick");
	await expect.poll(() => label.innerText()).toContain("esc exits");
	const canvasFrame = await childFrame(page, 'iframe[title="start"]');
	await canvasFrame.locator("#leave-then-copy").waitFor();
	await expect
		.poll(() => page.locator('iframe[title="start"]').evaluate((element) => getComputedStyle(element).pointerEvents))
		.toBe("auto");
	await page.waitForTimeout(300);
	const canvasRaceBox = await canvasFrame.locator("#leave-then-copy").boundingBox();
	if (canvasRaceBox === null) throw new Error("canvas race button has no box");
	await page.mouse.click(canvasRaceBox.x + canvasRaceBox.width / 2, canvasRaceBox.y + canvasRaceBox.height / 2);
	await expect
		.poll(() => canvasFrame.evaluate(() => (window as unknown as { __copyRace?: string }).__copyRace))
		.toBe("AbortError:Clipboard request interrupted by navigation");
	expect(
		await page.evaluate(
			() =>
				(window as unknown as { __spoolCanvasMessages: unknown[] }).__spoolCanvasMessages.filter(
					(message) =>
						typeof message === "object" && message !== null && "spool" in message && message.spool === "copy",
				).length,
		),
	).toBe(0);

	await page.goto(`${project.url}/play/${encodeURIComponent(project.name)}?frame=start`);
	const frame = await childFrame(page, "#spool-player");
	await frame.locator("#leave-then-copy").click();
	await frame.locator("#other").waitFor();

	expect(await frame.evaluate(() => (window as unknown as { __copyRace?: string }).__copyRace)).toBe(
		"AbortError:Clipboard request interrupted by navigation",
	);
	expect(
		await frame.evaluate(
			() =>
				(window as unknown as { __spoolPlayerMessages: unknown[] }).__spoolPlayerMessages.filter(
					(message) =>
						typeof message === "object" && message !== null && "spool" in message && message.spool === "copy",
				).length,
		),
	).toBe(0);
});
