import { expect, it, onTestFinished } from "vitest";
import { originCanvas } from "./hand-origin-browser-helpers";

it("shows the active literal field owner and its actual uses in the common disclosure", {
	timeout: 120000,
}, async () => {
	const button = 'export function Button({label,id}){return <button id={id} title="Shared tip">{label}</button>}';
	const calls =
		'import {Button} from "./button";export function Calls(){return <><Button id="first" label="First"/><Button id="other" label="Other"/></>}';
	const f = await originCanvas(
		{ "shared/button.tsx": button, "shared/calls.tsx": calls },
		'import {Calls} from "shared/calls";export default function Frame(){return <main style={{padding:40}}><Calls/></main>}',
		"#first",
		true,
	);
	const second = f.page.frameLocator('iframe[title="second"]');
	await second.locator("#other").waitFor();
	await f.select();
	const disclosure = f.page.getByRole("button", { name: "Show affected uses", exact: true });
	const panel = f.page.locator("[data-source-uses]");
	await expect.poll(() => disclosure.textContent()).toBe("2");
	await disclosure.click();
	await expect.poll(() => panel.textContent()).toContain("repeated call site · shared/calls.tsx");
	const title = f.page.getByRole("textbox", { name: "title", exact: true });
	// The real owner reach may finish after the disclosure has already opened
	// for the new field. Preparing its preview must not erase that disclosure.
	let releaseReach = () => {};
	const heldReach = new Promise<void>((resolve) => {
		releaseReach = resolve;
	});
	onTestFinished(() => releaseReach());
	let reachArrived = false;
	await f.page.route("**/source", async (route) => {
		if (route.request().postDataJSON()?.action !== "reach") return route.continue();
		const response = await route.fetch();
		reachArrived = true;
		await heldReach;
		await route.fulfill({ response });
	});
	await f.page.evaluate(() => {
		Reflect.set(window, "preparedReplies", []);
		addEventListener("message", (event) => {
			if (event.data?.spool === "source-reply") Reflect.get(window, "preparedReplies").push(event.data.id);
		});
	});
	await f.frame.locator("body").evaluate(() => {
		Reflect.set(window, "preparedRequest", undefined);
		addEventListener("message", (event) => {
			if (event.data?.spool === "source-request" && event.data.action === "prepare")
				Reflect.set(window, "preparedRequest", event.data.id);
		});
	});
	await title.focus();
	await expect.poll(() => reachArrived).toBe(true);
	await expect.poll(() => disclosure.textContent()).toBe("4");
	await expect.poll(() => panel.textContent()).toContain("shared definition · shared/button.tsx");
	expect(await f.page.getByText("Content", { exact: true }).locator("..").textContent()).toBe(
		"Contentrepeated call site",
	);
	await f.page.mouse.move(5, 5);
	await expect.poll(() => second.locator("#other").getAttribute("data-spool-shared-use")).toBe("");
	releaseReach();
	await expect
		.poll(async () => {
			const id = await f.frame.locator("body").evaluate(() => Reflect.get(window, "preparedRequest"));
			return (
				typeof id === "string" &&
				(await f.page.evaluate((id) => Reflect.get(window, "preparedReplies").includes(id), id))
			);
		})
		.toBe(true);
	for (const target of [f.frame.locator("#other"), second.locator("#first"), second.locator("#other")])
		await expect.poll(() => target.getAttribute("data-spool-shared-use")).toBe("");
	expect(await f.target.getAttribute("data-spool-shared-use")).toBeNull();
	await title.fill("Preview tip");
	for (const target of [f.target, f.frame.locator("#other"), second.locator("#first"), second.locator("#other")])
		await expect.poll(() => target.getAttribute("title")).toBe("Preview tip");
	await title.press("Escape");
	await expect.poll(() => second.locator("#other").getAttribute("title")).toBe("Shared tip");
	expect(f.bytes()).toEqual({ "shared/button.tsx": button, "shared/calls.tsx": calls });
	await f.edit();
	await expect.poll(() => disclosure.textContent()).toBe("2");
	await f.page.keyboard.press("Escape");
	const text = f.page.getByRole("textbox", { name: "Text", exact: true });
	await text.focus();
	await expect.poll(() => disclosure.textContent()).toBe("2");
	await disclosure.click();
	await expect.poll(() => panel.textContent()).toContain("repeated call site · shared/calls.tsx");
	expect(await f.frame.locator("#other").getAttribute("data-spool-shared-use")).toBeNull();
	await text.press("Escape");
	await title.fill("Saved tip");
	await title.press("Enter");
	await expect.poll(() => f.bytes()["shared/button.tsx"]).toContain('title="Saved tip"');
	await f.settled();
	for (const redo of [false, true]) {
		await f.history(redo);
		await f.settled();
		for (const target of [f.target, f.frame.locator("#other"), second.locator("#first"), second.locator("#other")])
			expect(await target.getAttribute("title")).toBe(redo ? "Saved tip" : "Shared tip");
		expect(f.bytes()["shared/calls.tsx"]).toBe(calls);
	}
	await f.select();
	await title.focus();
	await expect.poll(() => disclosure.textContent()).toBe("4");
	if ((await disclosure.getAttribute("aria-expanded")) !== "true") await disclosure.click();
	// Use the actual disclosure row: the field remains title when revealing a
	// different governed occurrence, instead of falling back to its label owner.
	const requested = second.locator("#other").evaluate(() => {
		Reflect.set(window, "fieldReveal", null);
		addEventListener("message", (event) => {
			if (event.data?.spool === "source-request" && event.data.action === "reveal")
				Reflect.set(window, "fieldReveal", event.data.original);
		});
	});
	await requested;
	await panel
		.getByRole("button", { name: /^second/ })
		.last()
		.click();
	await expect
		.poll(() => second.locator("#other").evaluate(() => Reflect.get(window, "fieldReveal")?.field))
		.toBe("title");
	expect(await second.locator("#other").getAttribute("title")).toBe("Saved tip");
});

it("holds the ownership header footprint and rejects a late description after another field takes focus", {
	timeout: 120000,
}, async () => {
	const f = await originCanvas(
		{
			"shared/button.tsx":
				'export function Button({label}){return <button id="label" title="Shared tip">{label}</button>}',
		},
		'import {Button} from "shared/button";export default function Frame(){return <main style={{padding:40}}><Button label="First"/></main>}',
		"#label",
		true,
	);
	await f.page.frameLocator('iframe[title="second"]').locator("#label").waitFor();
	await f.select();
	const disclosure = f.page.getByRole("button", { name: "Show affected uses", exact: true });
	await expect.poll(() => disclosure.textContent()).toBe("1");
	await disclosure.click();
	const title = f.page.getByRole("textbox", { name: "title", exact: true });
	await title.scrollIntoViewIfNeeded();
	const before = await title.boundingBox();
	const ownershipHeight = await f.page
		.locator("[data-source-ownership]")
		.evaluate((element) => element.getBoundingClientRect().height);
	let arrived = false;
	let release = () => {};
	const held = new Promise<void>((resolve) => {
		release = resolve;
	});
	await f.page.route("**/source", async (route) => {
		const body = route.request().postDataJSON();
		if (body.action !== "describe" || body.original?.field !== "title" || !body.inventories?.length) {
			await route.continue();
			return;
		}
		const response = await route.fetch();
		arrived = true;
		await held;
		await route.fulfill({ response });
	});
	try {
		await title.focus();
		await expect.poll(() => arrived).toBe(true);
		expect(await disclosure.count()).toBe(0);
		expect(await f.page.locator("[data-source-uses]").count()).toBe(0);
		expect(await f.page.locator("[data-source-ownership]").count()).toBe(1);
		expect(
			await f.page.locator("[data-source-ownership]").evaluate((element) => element.getBoundingClientRect().height),
		).toBe(ownershipHeight);
		expect((await title.boundingBox())?.y).toBe(before?.y);
		await f.page.getByRole("textbox", { name: "Text", exact: true }).focus();
		await expect.poll(() => disclosure.textContent()).toBe("1");
		const delivered = f.page.waitForResponse(
			(response) =>
				response.url().endsWith("/source") &&
				response.request().postDataJSON()?.action === "describe" &&
				response.request().postDataJSON()?.original?.field === "title" &&
				response.request().postDataJSON()?.inventories?.length > 0,
		);
		release();
		await delivered;
		await f.page.evaluate(
			() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
		);
		expect(await disclosure.textContent()).toBe("1");
		await f.page.getByRole("textbox", { name: "Text", exact: true }).press("Escape");
	} finally {
		release();
	}
});
