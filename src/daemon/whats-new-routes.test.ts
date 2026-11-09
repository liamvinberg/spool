import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it, vi } from "vitest";
import { makeApp, makeTempDir } from "../test-helpers";
import type { WhatsNewAnswer } from "./whats-new-routes";

it("reads changelog.json once, pops the card for a Mac that used spool before, and remembers it when the window says it was shown", async () => {
	const spoolDir = join(makeTempDir(), ".spool");
	// nothing remembered, but a project opened before 0.52.0 went out
	mkdirSync(spoolDir, { recursive: true });
	writeFileSync(
		join(spoolDir, "registry.json"),
		JSON.stringify({ version: 1, projects: [{ root: "/tmp/kaffe", openedAt: "2026-11-12T09:00:00Z" }] }),
	);
	const changelog = {
		through: "0.52.0",
		published: { "0.52.0": "2026-11-18T10:00:00Z" },
		releases: [
			{
				version: "0.52.0",
				date: "2026-11-18",
				entries: [
					{ kind: "minor", headline: "The agent's trail", title: "The canvas names the frame.", highlight: true },
				],
			},
			{ version: "0.51.0", date: "2026-11-10", entries: [{ kind: "patch", title: "A fix." }] },
		],
	};
	const fetch = vi.fn(async (_url: string | URL | Request) => Response.json(changelog));
	const app = makeApp(spoolDir, {
		whatsNew: {
			version: "0.52.0",
			url: "https://example.test/changelog.json",
			fetch: fetch as typeof globalThis.fetch,
		},
	});
	const ask = async () => (await (await app.request("/api/whats-new")).json()) as WhatsNewAnswer;

	const first = await ask();
	expect(first.pop).toBe(true);
	expect(first.content?.highlights).toEqual([{ title: "The agent's trail", says: "The canvas names the frame." }]);
	expect(String(fetch.mock.calls[0]?.[0])).toBe("https://example.test/changelog.json");

	expect((await app.request("/api/whats-new/seen", { method: "POST" })).status).toBe(204);
	expect(JSON.parse(readFileSync(join(spoolDir, "config.json"), "utf8"))).toEqual({
		whatsNew: { seen: "0.52.0", from: "0.51.0" },
	});
	const after = await ask();
	expect(after.pop).toBe(false);
	expect(after.content?.version).toBe("0.52.0");
	expect(fetch).toHaveBeenCalledTimes(1);
});
