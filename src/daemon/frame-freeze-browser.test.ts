import { expect, it, onTestFinished } from "vitest";
import { testBrowser } from "../test-browser";
import { builtUi, serveProject, sseReader, writeDesignFile, writeFrame } from "../test-helpers";

// The freeze end to end (#171, #319): a real canvas, real sandboxed frame
// documents, a real wheel pan and a real pick. The shim's rAF gate and the
// canvas's decisions are each covered on their own; what only a browser can
// show is that the two meet across the iframe boundary — that a frame animating
// at speed stops counting while the camera moves, and again for as long as the
// hand holds an element on any frame, and picks up where it held afterwards.

/**
 * A loop that counts its own animation frames onto the frame's own window, as a
 * ref body. The lookup is `view.requestAnimationFrame` at call time on purpose:
 * a destructured reference would be the native one, which the shim's gate never
 * sees.
 */
const counting = `(el) => {
	if (el === null) return;
	const view = el.ownerDocument.defaultView;
	if (view === null || view.spun !== undefined) return;
	view.spun = 0;
	const loop = () => {
		view.spun++;
		view.requestAnimationFrame(loop);
	};
	view.requestAnimationFrame(loop);
}`;

const spinner = `export default function Frame() {
	return <p ref={${counting}}>spinning</p>;
}
`;

/**
 * The frame the hand works on: a heading to pick, a line whose width is a
 * fraction of the frame so a resize has something to reflow, and a shader-shaped
 * loop of its own running underneath.
 */
const veil = (words: string) => `export default function Frame() {
	return (
		<main style={{ padding: 24, fontFamily: "system-ui" }}>
			<h1 style={{ width: "50%", margin: 0, fontSize: 40 }}>${words}</h1>
			<p ref={${counting}}>spinning</p>
		</main>
	);
}
`;

it("holds a live frame's animation while the camera moves, and lets it go after", { timeout: 180_000 }, async () => {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });

	writeFrame(project.root, "spin", spinner);
	// wide enough to read at k=1, and it stays inside the ring across the pan
	writeDesignFile(project.root, "frames/spin/frame.json", '{ "x": 0, "y": 0, "w": 800, "h": 700 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	const spun = () =>
		page
			.frameLocator('iframe[title="spin"]')
			.locator("p")
			.evaluate((el) => (el.ownerDocument.defaultView as unknown as { spun?: number }).spun ?? -1);

	// the loop is really running before anything is asked of it
	await expect.poll(spun, { timeout: 30_000 }).toBeGreaterThan(4);

	await page.mouse.move(640, 450);
	// a wheel event every 40ms outlasts the canvas's 100ms settle, so the camera
	// is still moving for the whole window sampled below
	const panning = (async () => {
		for (let i = 0; i < 20; i++) {
			await page.mouse.wheel(0, 10);
			await page.waitForTimeout(40);
		}
	})();

	let atFreeze: number;
	let held: number;
	try {
		await page.waitForTimeout(250);
		atFreeze = await spun();
		await page.waitForTimeout(300);
		held = await spun();
	} finally {
		// the pan outlives a failed assertion; leaving it running closes the page
		// out from under it and buries the failure in an unhandled rejection
		await panning.catch(() => undefined);
	}

	expect(held, "a frame animating under a moving camera runs no frames").toBe(atFreeze);
	await expect.poll(spun, { timeout: 10_000 }).toBeGreaterThan(atFreeze + 4);
});

/**
 * A shader-shaped surface: a canvas that clears itself the moment its size
 * changes and only ever paints inside an animation frame. The observer runs
 * under a freeze — layout never stops — so a frozen document resized by a drag
 * goes black and stays black until it is handed a tick (#322).
 */
const surface = `(el) => {
	if (el === null) return;
	const view = el.ownerDocument.defaultView;
	if (view === null || view.painted !== undefined) return;
	view.painted = 0;
	let dirty = true;
	new view.ResizeObserver((entries) => {
		const box = entries[0].contentRect;
		// setting the size is what clears it, exactly as a WebGL surface clears
		el.width = Math.max(1, Math.round(box.width));
		el.height = Math.max(1, Math.round(box.height));
		dirty = true;
	}).observe(el);
	const paint = () => {
		if (dirty) {
			const ctx = el.getContext("2d");
			if (ctx !== null) {
				ctx.fillStyle = "#c96a3c";
				ctx.fillRect(0, 0, el.width, el.height);
			}
			dirty = false;
			view.painted++;
		}
		view.requestAnimationFrame(paint);
	};
	view.requestAnimationFrame(paint);
}`;

/** The art block a drag resizes, drawn over a surface that only paints in rAF. */
const art = `export default function Frame() {
	return (
		<main style={{ padding: 24, fontFamily: "system-ui" }}>
			<h1 style={{ margin: 0, fontSize: 24 }}>art</h1>
			<div className="w-[300px] h-[200px] p-[12px]">
				<canvas style={{ display: "block", width: "100%", height: "100%" }} ref={${surface}} />
			</div>
			<p ref={${counting}}>spinning</p>
		</main>
	);
}
`;

/**
 * Two live frames side by side at rest: the one the hand works on, and one
 * beside it doing nothing but animating. Both are drawn wide enough to read at
 * k=1, so both hold documents rather than pictures.
 */
async function twoLiveFrames(home: string, pickSelector = "h1") {
	const browser = await testBrowser();
	const uiDir = await builtUi();
	const project = await serveProject({ uiDir });

	writeFrame(project.root, "home", home);
	writeDesignFile(project.root, "frames/home/frame.json", '{ "x": 0, "y": 0, "w": 620, "h": 480 }\n');
	writeFrame(project.root, "beside", spinner);
	writeDesignFile(project.root, "frames/beside/frame.json", '{ "x": 700, "y": 0, "w": 620, "h": 480 }\n');
	writeDesignFile(project.root, ".spool/state.json", `${JSON.stringify({ camera: { x: 60, y: 60, k: 1 } })}\n`);

	const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
	await page.goto(`${project.url}/p/${encodeURIComponent(project.name)}`);

	const heading = page.frameLocator('iframe[title="home"]').locator(pickSelector);
	const spun = (frame: string) =>
		page
			.frameLocator(`iframe[title="${frame}"]`)
			.locator("p")
			.evaluate((el) => (el.ownerDocument.defaultView as unknown as { spun?: number }).spun ?? -1);
	/** How many animation frames a document ran over a third of a second. */
	const ran = async (frame: string) => {
		const before = await spun(frame);
		await page.waitForTimeout(300);
		return (await spun(frame)) - before;
	};
	const selected = async () => {
		const response = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/selection`, {
			headers: { "X-Spool-Control": project.controlToken },
		});
		const body = (await response.json()) as { selection?: unknown[] };
		return body.selection?.length ?? 0;
	};
	const pick = async (position?: { x: number; y: number }) => {
		await expect.poll(() => heading.count(), { timeout: 30_000 }).toBe(1);
		// the canvas takes the pointer off the iframe before a click can pick
		// through it; on a loaded runner that lands well after the frame does
		await expect
			.poll(() => page.locator('iframe[title="home"]').evaluate((el) => getComputedStyle(el).pointerEvents), {
				timeout: 30_000,
			})
			.toBe("none");
		await heading.click({
			modifiers: [process.platform === "darwin" ? "Meta" : "Control"],
			...(position === undefined ? {} : { position }),
		});
		await expect.poll(selected, { timeout: 30_000 }).toBe(1);
	};
	/** Let go, on the empty field below both frames. */
	const deselect = async () => {
		await page.mouse.click(400, 820);
		await expect.poll(selected, { timeout: 30_000 }).toBe(0);
	};
	return { project, page, heading, spun, ran, pick, deselect };
}

it("holds every live frame while the hand holds an element, and hands them back", { timeout: 180_000 }, async () => {
	const { page, ran, pick, deselect } = await twoLiveFrames(veil("veil"));

	// both loops are really running before anything is asked of them
	await expect.poll(() => ran("home"), { timeout: 60_000 }).toBeGreaterThan(4);
	await expect.poll(() => ran("beside"), { timeout: 30_000 }).toBeGreaterThan(4);

	await pick();

	// polled rather than sampled once: a frame owing a picture is photographed
	// out of a thawed document, and that errand outlives the pick by a moment.
	// The frame the element is in stops with the rest of them.
	await expect.poll(() => ran("home"), { timeout: 30_000 }).toBe(0);
	await expect.poll(() => ran("beside"), { timeout: 30_000 }).toBe(0);
	// and it stays stopped rather than thawing itself a moment later
	await page.waitForTimeout(1000);
	expect(await ran("beside"), "a frozen field stays frozen while the hand holds").toBe(0);

	await deselect();

	await expect.poll(() => ran("home"), { timeout: 30_000 }).toBeGreaterThan(4);
	await expect.poll(() => ran("beside"), { timeout: 30_000 }).toBeGreaterThan(4);
});

it("reflows a frozen frame, so a preview under the hand is true", { timeout: 180_000 }, async () => {
	const { project, heading, ran, pick } = await twoLiveFrames(veil("veil"));

	await expect.poll(() => ran("home"), { timeout: 60_000 }).toBeGreaterThan(4);
	await pick();
	await expect.poll(() => ran("home"), { timeout: 30_000 }).toBe(0);

	const width = () => heading.evaluate((el) => Math.round(el.getBoundingClientRect().width));
	const before = await width();
	// the heading is half the frame's own width: a wider frame is a wider
	// heading, and only layout can say so
	expect(before).toBeGreaterThan(0);

	const response = await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/geometry`, {
		method: "PUT",
		headers: { "content-type": "application/json", "X-Spool-Control": project.controlToken },
		body: JSON.stringify({ frames: { home: { x: 0, y: 0, w: 900, h: 480 } } }),
	});
	expect(response.status).toBe(204);

	// the held document laid itself out at its new size
	await expect.poll(width, { timeout: 30_000 }).toBeGreaterThan(before + 100);
	// the freeze never lifted for it: rAF is what stopped, not layout
	await expect.poll(() => ran("home"), { timeout: 30_000 }).toBe(0);
});

it("reloads a frame written under the hand on the deselect, behind its own paint", { timeout: 180_000 }, async () => {
	const { project, page, heading, ran, pick, deselect } = await twoLiveFrames(veil("before"));

	await expect.poll(() => ran("home"), { timeout: 60_000 }).toBeGreaterThan(4);
	await pick();
	await expect.poll(() => ran("home"), { timeout: 30_000 }).toBe(0);
	expect(await heading.textContent()).toBe("before");

	// this document is the one the hand is working in; a reload replaces it, and
	// the marker says whether one happened
	const kept = () => heading.evaluate((el) => Reflect.get(el.ownerDocument.defaultView ?? {}, "kept"));
	await heading.evaluate((el) => {
		const view = el.ownerDocument.defaultView;
		if (view !== null) Reflect.set(view, "kept", true);
	});
	// the held document is the one still on screen when the reload comes, so
	// there is never a white frame in between (#253's no blink)
	await page.evaluate(() => {
		Reflect.set(window, "everHeld", false);
		new MutationObserver(() => {
			if (document.querySelector('iframe[title="home (held)"]') !== null) Reflect.set(window, "everHeld", true);
		}).observe(document.body, { subtree: true, childList: true });
	});

	// the same stream the canvas is reading, so the case waits on the change the
	// canvas is being told about rather than on a guess at the watcher's pace
	const controller = new AbortController();
	onTestFinished(() => controller.abort());
	const events = sseReader(
		await fetch(`${project.url}/api/p/${encodeURIComponent(project.name)}/events`, {
			headers: { "X-Spool-Control": project.controlToken },
			signal: controller.signal,
		}),
	);

	// the save a hand write would make, straight to the file the frame renders
	writeFrame(project.root, "home", veil("after"));
	await expect
		.poll(
			async () => {
				const event = await events.next(15_000);
				return event.event === "change" && (event.data as { kind?: string }).kind === "frame";
			},
			{ timeout: 30_000 },
		)
		.toBe(true);
	// and the moment a reload would have taken
	await page.waitForTimeout(1500);

	expect(await heading.textContent(), "the frame the hand holds is not reloaded under it").toBe("before");
	expect(await kept()).toBe(true);

	await deselect();

	await expect.poll(() => heading.textContent(), { timeout: 30_000 }).toBe("after");
	expect(await page.evaluate(() => Reflect.get(window, "everHeld")), "the outgoing document stood in front").toBe(
		true,
	);
	// the document really is a new one, and it animates again
	expect(await kept()).toBe(undefined);
	await expect.poll(() => ran("home"), { timeout: 30_000 }).toBeGreaterThan(4);
});

it("hands the frame under a drag its animation frames, and takes them back after", {
	timeout: 240_000,
}, async () => {
	const { page, ran, pick } = await twoLiveFrames(art, "main > div");
	// on the block's own rim rather than the surface filling it: the modifier
	// takes the deepest element under the pointer
	const surfaceFrame = page.frameLocator('iframe[title="home"]');
	/** How many times the surface repainted over a third of a second. */
	const painted = () =>
		surfaceFrame.locator("canvas").evaluate((el) => (el.ownerDocument.defaultView as unknown as { painted?: number }).painted ?? -1);
	const repainting = async () => {
		const before = await painted();
		await page.waitForTimeout(300);
		return (await painted()) - before;
	};
	/** Whether the middle of the surface is drawn on rather than cleared. */
	const lit = () =>
		surfaceFrame.locator("canvas").evaluate((el) => {
			const canvas = el as HTMLCanvasElement;
			const ctx = canvas.getContext("2d");
			if (ctx === null || canvas.width === 0) return false;
			const dot = ctx.getImageData(Math.floor(canvas.width / 2), Math.floor(canvas.height / 2), 1, 1).data;
			return (dot[3] ?? 0) > 0;
		});

	await expect.poll(() => ran("beside"), { timeout: 60_000 }).toBeGreaterThan(4);
	expect(await lit()).toBe(true);

	await pick({ x: 6, y: 6 });
	// the whole field holds still, the surface included
	await expect.poll(() => ran("beside"), { timeout: 30_000 }).toBe(0);
	await expect.poll(repainting, { timeout: 30_000 }).toBe(0);

	await expect.poll(() => page.locator('[data-element-handle="e"]').count(), { timeout: 30_000 }).toBe(1);
	const knob = await page.locator('[data-element-handle="e"]').boundingBox();
	if (knob === null) throw new Error("the ring drew no east handle");
	const from = { x: knob.x + knob.width / 2, y: knob.y + knob.height / 2 };
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	for (const dx of [30, 70, 120, 170]) {
		await page.mouse.move(from.x + dx, from.y);
		// the size changed, which cleared the surface: only an animation frame
		// puts it back, and the drag is what earns the frame one
		await expect.poll(lit, { timeout: 15_000 }).toBe(true);
	}
	// the frame under the hand is animating again; nothing else on the field is
	expect(await ran("home"), "the frame under the drag gets its animation frames").toBeGreaterThan(0);
	expect(await ran("beside"), "the rest of the field stays held").toBe(0);
	expect(await lit()).toBe(true);
	expect(await repainting()).toBe(0); // the surface repaints on a resize, not on a tick

	const wrote = page.waitForResponse((response) => response.url().endsWith("/class"));
	await page.mouse.up();
	await wrote;
	// the write left it wearing a size it had to draw, and it holds again after
	await expect.poll(lit, { timeout: 15_000 }).toBe(true);
	await expect.poll(() => ran("home"), { timeout: 30_000 }).toBe(0);
	expect(await lit()).toBe(true);
	expect(await ran("beside")).toBe(0);
});
