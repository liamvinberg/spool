import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

// A disposable, capability-free review export. The approved editing frame stays intact.
const project = dirname(fileURLToPath(import.meta.url));
const output = resolve(project, ".everyday-export");
const cases = [
	[
		"everyday",
		"Everyday editing",
		"Select, type, scrub, resize, apply tokens, replace an image, hide and delete. The third button use starts below the viewport.",
	],
	[
		"everyday--independent",
		"An independent agent edit",
		"Padding has changed and the agent added a margin. Undo the padding; the margin should remain.",
	],
	[
		"everyday--conflict",
		"A competing property edit",
		"Your requested padding is kept beside the current value. Retry explicitly or prepare an agent request.",
	],
	[
		"everyday--lost",
		"The target disappears",
		"The selected source is gone. Your requested input survives, and nothing is automatically retargeted.",
	],
	[
		"everyday--mismatch",
		"Saved, but one use stays unchanged",
		"The confirmation frame keeps its previous output. Compare the three uses, then try Undo or the explicit reload.",
	],
	[
		"everyday--loading",
		"Saved and still rendering",
		"One use shows the application's loading view. Complete the simulated render to see the saved result.",
	],
	[
		"everyday--render-failure",
		"Saved with a render failure",
		"Saving and rendering have separate outcomes. A failed use stays visible in the rail; reload is explicit.",
	],
	[
		"everyday--rollback",
		"Verification failure with recovery",
		"The saved result did not match. A guarded rollback restored the previous declaration and kept your input.",
	],
	[
		"everyday--rollback-blocked",
		"Rollback is blocked",
		"Another edit prevents the inverse. Undo refuses without skipping this entry or losing your requested input.",
	],
	[
		"everyday--connection",
		"Save outcome unknown",
		"The connection ended before acknowledgement. Check current source; a missing receipt is not invented.",
	],
];
const stdout = execFileSync("pnpm", ["dev", "url", "everyday", "--raw"], { cwd: project, encoding: "utf8" });
const raw = stdout.split("\n").find((line) => line.startsWith("http"));
assert(raw, "Run pnpm dev open in this prototype project first.");
for (const [frame] of cases) {
	const url = raw.replace(/everyday$/, frame);
	execFileSync(process.execPath, [resolve(project, "export.mjs"), url, resolve(output, frame)], { stdio: "inherit" });
}
await writeFile(
	resolve(output, "index.html"),
	`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Everyday edits · spool</title><link rel="icon" href="data:,"><style>
*{box-sizing:border-box}body{margin:0;background:#0e0e0e;color:#f0efed;font:16px/1.55 system-ui,sans-serif}main{max-width:900px;margin:64px auto;padding:0 28px 80px}h1{font-size:42px;letter-spacing:-1.5px;font-weight:500;line-height:1.1;margin:0 0 20px}p{max-width:680px;color:#999792}a{color:inherit;text-decoration:none}a:hover{text-decoration:underline;text-underline-offset:4px}.start{display:inline-block;margin:12px 0 32px;padding:10px 16px;background:#f5391a;color:white;border-radius:4px}ol{padding-left:22px;max-width:710px}li{margin-bottom:12px}.case{display:grid;grid-template-columns:280px 1fr;gap:28px;border-top:1px solid #262626;padding:20px 0}.case p{font-size:14px;margin:0}.case a{font-weight:500}.truth{border-top:1px solid #262626;margin-top:32px;padding-top:12px;font-size:14px}h2{font-size:23px;font-weight:500;margin-top:36px}@media(max-width:640px){main{margin-top:32px}.case{grid-template-columns:1fr;gap:8px}}
</style><main><h1>Everyday edits</h1><p>The approved playground controls, carried into a three-frame editing journey. The original landing playground is unchanged.</p><a class="start" href="everyday/">Open the walkthrough ↗</a>
<ol><li>Change the first button’s label, then its padding. Only its label stays local. Open <b>3 uses</b> and reveal the journal use, then Undo.</li><li>Select the arrow inside a button and change its text or color. That inner part belongs to the shared definition.</li><li>Select a heading and resize its box. Try padding, an exact fractional value, Escape, gap tokens on the navigation, and adding a border.</li><li>Choose <b>md:</b>, change padding, then switch the frame viewport to 820px. The chosen source scope and the current pixels stay distinct.</li><li>Delete the supplied heading. The authored default appears. Undo restores the supplied heading. Try Hide and Show again, and replace a trip image.</li></ol>
<h2>Remaining states</h2><p>These are separate named states of the same treatment. The testing menu can also put the next edit into any of these cases.</p>
${cases
	.slice(1)
	.map(([frame, name, note]) => `<div class="case"><a href="${frame}/">${name} ↗</a><p>${note}</p></div>`)
	.join("\n")}
<div class="truth"><p><b>What is real:</b> browser layout, nested selection, editable text, exact input, scrubbing, resizing, gap and color bindings, image decoding, three rendered uses of shared React components, and in-memory undo.</p><p><b>What is simulated:</b> source ownership and use counts are authored for this project. Saves, admission, competing writes, live handover, reload, loading and failure outcomes are presentation models. No repository file is written and no agent starts. Reloading the page resets the prototype.</p><p>This walkthrough is ready for your reaction to the new states. It does not establish production source-writing feasibility or reopen the approved visual direction.</p></div></main></html>`,
);
console.log(`Exported the walkthrough to ${output}`);
if (!process.argv.includes("--export-only")) {
	const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml" };
	createServer(async (request, response) => {
		const pathname = decodeURIComponent(new URL(request.url ?? "/", "http://localhost").pathname);
		const target = resolve(output, `.${pathname}${pathname.endsWith("/") ? "index.html" : ""}`);
		if (!target.startsWith(`${output}${sep}`)) {
			response.writeHead(403).end();
			return;
		}
		try {
			const bytes = await readFile(target);
			response.writeHead(200, { "Content-Type": types[extname(target)] ?? "application/octet-stream" }).end(bytes);
		} catch {
			response.writeHead(404).end("Not found");
		}
	}).listen(7812, "127.0.0.1", () => console.log("Everyday editing review: http://127.0.0.1:7812/"));
}
