// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, onTestFinished } from "vitest";
import type { ShareCommenter, SharesSource, ShareView } from "../share-view";
import { ShareCommentersList } from "./shares";

/** A share's settings list who commented through it (spool#174), as spool.page answers them: `last` in milliseconds. */

const SHARE: ShareView = {
	id: "s1",
	kind: "link",
	pages: [""],
	people: [],
	by: "bo@kaffe.example",
	at: 0,
	opens: 0,
	link: "https://k7qm2xpa.onspool.page",
};

it("says when each commenter last wrote, from spool.page's milliseconds", async () => {
	const now = Date.now();
	const commenters: ShareCommenter[] = [
		{ account: "jonas", name: "Jonas Ek", posts: 3, last: now - 4 * 60_000, blocked: false },
		{ account: "mia", name: "Mia", posts: 1, last: now - 3 * 3_600_000, blocked: false },
		{ account: "spam", name: "Spam", posts: 0, last: now, blocked: true },
	];
	const source: SharesSource = {
		read: async () => ({ state: "ready", shares: [SHARE], manage: true }),
		change: async () => null,
		stop: async () => null,
		commenters: async () => commenters,
		block: async () => null,
	};
	const root = document.createElement("div");
	document.body.append(root);
	const mounted = createRoot(root);
	onTestFinished(() => act(() => mounted.unmount()));
	await act(async () => {
		mounted.render(createElement(ShareCommentersList, { share: SHARE, source, manage: true, onChanged: () => {} }));
	});
	const line = (account: string) => root.querySelector(`[data-share-commenter="${account}"]`)?.textContent;
	expect(line("jonas")).toBe("Jonas Ek3 comments · 4 min agoBlock");
	expect(line("mia")).toBe("Mia1 comment · 3 hours agoBlock");
	expect(line("spam")).toBe("Spamblocked");
});
