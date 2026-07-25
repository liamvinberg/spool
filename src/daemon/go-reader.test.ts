import { join } from "node:path";
import { describe, expect, it, onTestFinished } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import type { Flows } from "./flows";
import { createGoReader } from "./go-reader";
import { serveDaemon } from "./server";

/**
 * The one Playwright smoke for reading resolved targets — the render path is
 * deliberately unseamed, like the shot taker's (#18). Tolerant: on a machine
 * without a playwright-managed browser this observes the honest no-op, a map
 * that keeps naming the site instead of resolving it.
 *
 * What it proves that the seamed tests cannot: React really does put the
 * computed value in the attribute, and the element's stamp really does match
 * the anchor the parser recorded. Those two facts are the whole premise.
 */

const ROWS = `export function Rows({ items }) {
	return items.map((it) => (
		<button
			key={it.id}
			type="button"
			data-go={it.frame}
		>
			{it.id}
		</button>
	));
}
`;

const INDEX = `import { Rows } from "../../shared/ui/rows";
const ITEMS = [{ id: "a", frame: "one" }, { id: "b", frame: "two" }];
export default function Frame() {
	return <Rows items={ITEMS} />;
}
`;

const plainTsx = `export default function Frame() {\n\treturn <main>here</main>;\n}\n`;

describe("reading resolved data-go off a real render", () => {
	it("fills a computed target through the whole pass, or no-ops without a browser", { timeout: 90_000 }, async () => {
		const probe = createGoReader();
		const browserless =
			(await probe.read({
				url: "data:text/html,<div id=root><p x=1>x</p></div>",
				width: 20,
				height: 20,
			})) === undefined;
		await probe.close();

		const spoolDir = join(makeTempDir(), ".spool");
		const { root, name } = makeProject(spoolDir);
		writeDesignFile(root, "shared/ui/rows.tsx", ROWS);
		writeFrame(root, "index", INDEX);
		writeFrame(root, "one", plainTsx);
		writeFrame(root, "two", plainTsx);

		const daemon = await serveDaemon({ spoolDir, version: "0.0.0-test", host: "127.0.0.1", port: 0 });
		onTestFinished(() => daemon.close());
		const control = { headers: { "X-Spool-Control": daemon.controlToken } };

		const flowsNow = async (): Promise<Flows> =>
			(await (await fetch(`${daemon.url}/api/p/${name}/flows`, control)).json()) as Flows;

		// before any render: the site is named, no edge exists
		const before = await flowsNow();
		expect(before.edges).toEqual([]);
		expect(before.unreadable).toEqual([{ frame: "index", path: "shared/ui/rows.tsx", line: 6 }]);

		const res = await fetch(`${daemon.url}/api/p/${name}/flows/resolve`, { ...control, method: "POST" });
		expect(res.status).toBe(200);
		const summary = (await res.json()) as { ran: boolean; read: number; unavailable: number };
		expect(summary.ran).toBe(true);

		if (browserless) {
			// no playwright-managed build on this machine: the pass must report
			// the frame as unanswered and the map must not have changed
			expect(summary.unavailable).toBe(1);
			expect(summary.read).toBe(0);
			const after = await flowsNow();
			expect(after.edges).toEqual([]);
			expect(after.unreadable).toHaveLength(1);
			return;
		}

		expect(summary.read).toBe(1);
		const after = await flowsNow();
		// both values React computed are now edges, marked as render-resolved
		expect(after.edges.map((edge) => edge.to).sort()).toEqual(["one", "two"]);
		expect(after.edges.every((edge) => edge.resolved === true)).toBe(true);
		expect(after.unreadable).toEqual([]);

		// a second pass reuses the stored read rather than launching again
		const again = await fetch(`${daemon.url}/api/p/${name}/flows/resolve`, { ...control, method: "POST" });
		expect(((await again.json()) as { skipped: number }).skipped).toBe(1);
	});
});
