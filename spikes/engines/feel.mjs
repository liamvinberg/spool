// spool#219 feel and cost: N live animating cards in each engine; CPU share and memory of the
// engine's processes over a 5 s window after 2 s of warm-up. Software rendering on devobee for all.
// usage: node feel.mjs <chromium|servo|own> <N>
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "playwright-core";

const here = dirname(fileURLToPath(import.meta.url));
const [engine, nArg] = process.argv.slice(2);
const N = Number(nArg);
const HOST = `http://127.0.0.1:7892/bench/host-${N}.html`;
const TICK = Number(execFileSync("getconf", ["CLK_TCK"], { encoding: "utf8" }));

function tree(pid) {
	const out = [pid];
	for (let i = 0; i < out.length; i++) {
		try {
			const kids = execFileSync("pgrep", ["-P", String(out[i])], { encoding: "utf8" }).trim().split("\n").filter(Boolean).map(Number);
			out.push(...kids);
		} catch {}
	}
	return out;
}
function cpu(pids) {
	let t = 0;
	for (const p of pids) {
		try {
			const f = readFileSync(`/proc/${p}/stat`, "utf8").split(") ")[1].split(" ");
			t += Number(f[11]) + Number(f[12]);
		} catch {}
	}
	return t / TICK;
}
function pss(pids) {
	let kb = 0;
	for (const p of pids) {
		try {
			kb += Number(readFileSync(`/proc/${p}/smaps_rollup`, "utf8").match(/^Pss:\s+(\d+)/m)[1]);
		} catch {}
	}
	return Math.round(kb / 1024);
}
async function sample(rootPid, skipRoot) {
	await new Promise((r) => setTimeout(r, 2000));
	const pids = tree(rootPid).slice(skipRoot ? 1 : 0);
	const c0 = cpu(pids),
		t0 = Date.now();
	await new Promise((r) => setTimeout(r, 5000));
	const pids2 = tree(rootPid).slice(skipRoot ? 1 : 0);
	const cores = (cpu(pids2) - c0) / ((Date.now() - t0) / 1000);
	return { cpuCores: +cores.toFixed(2), pssMB: pss(pids2), processes: pids2.length };
}

let result;
if (engine === "chromium" || engine === "own") {
	const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
	const page = await browser.newPage({ viewport: { width: 2400, height: 1400 } });
	if (engine === "chromium") await page.goto(HOST);
	else {
		const bundle = await build({
			entryPoints: [join(here, "own/examples/anim-entry.tsx")],
			bundle: true,
			write: false,
			format: "esm",
			jsx: "automatic",
			alias: { own: join(here, "own/renderer.jsx") },
			define: { "process.env.NODE_ENV": '"production"', __N__: String(N) },
			logLevel: "error",
		});
		const files = {
			"/": ["text/html", `<!doctype html><body style="margin:0"><canvas id="c"></canvas><script src="/ck/canvaskit.js"></script><script type="module" src="/b.js"></script>`],
			"/b.js": ["text/javascript", bundle.outputFiles[0].text],
			"/ck/canvaskit.js": ["text/javascript", readFileSync(join(here, "node_modules/canvaskit-wasm/bin/canvaskit.js"))],
			"/ck/canvaskit.wasm": ["application/wasm", readFileSync(join(here, "node_modules/canvaskit-wasm/bin/canvaskit.wasm"))],
			"/fonts/Inter.ttf": ["font/ttf", readFileSync(join(here, "own/fonts/Inter.ttf"))],
		};
		await page.route("http://own.local/**", (r) => {
			const f = files[new URL(r.request().url()).pathname];
			return f ? r.fulfill({ contentType: f[0], body: f[1] }) : r.fulfill({ status: 404, body: "" });
		});
		await page.goto("http://own.local/");
	}
	result = await sample(process.pid, true);
	if (engine === "own") result.engineStats = await page.evaluate(() => window.__stats && { ...window.__stats });
	await browser.close();
} else if (engine === "servo") {
	const p = spawn("/tmp/s219/servo/servo/servoshell", ["--headless", "--window-size=2400x1400", HOST], { stdio: "ignore" });
	result = await sample(p.pid);
	p.kill("SIGKILL");
}
console.log(JSON.stringify({ engine, N, ...result }));
