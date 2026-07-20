// srcdoc HTML per screen kind. Five reused from the canvas-bakeoff "loops" app,
// four new kinds that do continuous work (rAF canvas sim, rAF marquee, interval DOM
// churn) or hold mutable state (todo — the state-survival demo for the lifecycle).
//
// instrument() appends the in-frame agent every frame runs:
//   - counts its own rAF ticks, reports ticks/s to the parent (throttling evidence)
//   - posts "loaded" on boot (hydrate-storm timing)
//   - answers {spool:"capture"} with a foreignObject self-rasterization (thumbnail path A)

import type { ScreenKind } from "./scene";

const base = `<style>
	* { margin: 0; box-sizing: border-box; }
	html, body { height: 100%; }
	body {
		font-family: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
		background: #fff; color: #1a1523;
		-webkit-font-smoothing: antialiased;
		user-select: none;
	}
	.accent { color: #6e56cf; }
	.btn {
		display: inline-flex; align-items: center; justify-content: center;
		border: 0; border-radius: 10px; cursor: pointer;
		font: inherit; font-weight: 600;
	}
	.btn-primary { background: #6e56cf; color: #fff; }
	.btn-primary:hover { background: #644fc1; }
	.btn-secondary { background: #f1eefc; color: #6e56cf; }
	.btn-ghost { background: transparent; color: #6f6e77; }
	.btn:disabled { opacity: 0.45; cursor: default; }
</style>`;

const login = `${base}
<body style="display:flex;flex-direction:column;justify-content:center;padding:32px;gap:16px">
	<div style="margin-bottom:24px">
		<div style="width:44px;height:44px;border-radius:14px;background:#6e56cf;display:flex;align-items:center;justify-content:center;margin-bottom:16px">
			<div style="width:18px;height:18px;border-radius:50%;border:3.5px solid #fff;border-right-color:transparent"></div>
		</div>
		<h1 style="font-size:28px;letter-spacing:-0.5px">loops</h1>
		<p style="color:#6f6e77;margin-top:6px;font-size:15px">Small habits, kept daily.</p>
	</div>
	<input placeholder="email" style="padding:14px 16px;border:1px solid #e4e2e9;border-radius:10px;font:inherit;font-size:15px;outline-color:#6e56cf">
	<input placeholder="password" type="password" style="padding:14px 16px;border:1px solid #e4e2e9;border-radius:10px;font:inherit;font-size:15px;outline-color:#6e56cf">
	<button class="btn btn-primary" style="padding:14px;font-size:15px" onclick="this.textContent='signing in…'">sign in</button>
	<p style="text-align:center;color:#6f6e77;font-size:13px">no account? <span class="accent" style="font-weight:600">start a loop</span></p>
</body>`;

const habitRow = (emoji: string, name: string, streak: number, pct: number) => `
	<div style="display:flex;align-items:center;gap:14px;padding:14px 16px;border:1px solid #eeedf2;border-radius:14px;background:#fff">
		<div style="font-size:22px">${emoji}</div>
		<div style="flex:1">
			<div style="font-weight:600;font-size:15px">${name}</div>
			<div style="color:#6f6e77;font-size:12.5px;margin-top:2px">${streak} day streak</div>
		</div>
		<svg width="34" height="34" viewBox="0 0 34 34" style="flex-shrink:0">
			<circle cx="17" cy="17" r="14" fill="none" stroke="#eeedf2" stroke-width="4"/>
			<circle cx="17" cy="17" r="14" fill="none" stroke="#6e56cf" stroke-width="4" stroke-linecap="round"
				stroke-dasharray="${(pct * 87.96).toFixed(1)} 87.96" transform="rotate(-90 17 17)"/>
		</svg>
	</div>`;

const clock = `${base}
<body style="display:flex;flex-direction:column;height:100%;background:#fafafa">
	<div style="padding:26px 20px 14px">
		<div style="display:flex;justify-content:space-between;align-items:baseline">
			<h1 style="font-size:24px;letter-spacing:-0.4px">today</h1>
			<div id="clock" style="font-size:13px;color:#6f6e77;font-variant-numeric:tabular-nums"></div>
		</div>
		<p style="color:#6f6e77;font-size:13.5px;margin-top:4px">3 of 4 loops closed</p>
	</div>
	<div style="flex:1;display:flex;flex-direction:column;gap:10px;padding:6px 16px;overflow:hidden">
		${habitRow("🏃", "morning run", 12, 1)}
		${habitRow("📖", "read 20 pages", 34, 1)}
		${habitRow("🧘", "meditate", 5, 1)}
		${habitRow("🎹", "practice piano", 2, 0.4)}
	</div>
	<div style="display:flex;justify-content:space-around;padding:14px 0 26px;border-top:1px solid #eeedf2;background:#fff">
		<div style="font-size:12px;font-weight:700" class="accent">today</div>
		<div style="font-size:12px;color:#6f6e77">stats</div>
		<div style="font-size:12px;color:#6f6e77">settings</div>
	</div>
	<script>
		const el = document.getElementById("clock");
		const tick = () => { el.textContent = new Date().toLocaleTimeString("sv-SE"); };
		tick(); setInterval(tick, 1000);
	</script>
</body>`;

const habit = `${base}
<style>
	@keyframes ring { from { stroke-dasharray: 0 264; } to { stroke-dasharray: 198 264; } }
	.ring-fg { animation: ring 1.6s cubic-bezier(0.22, 1, 0.36, 1) forwards; }
</style>
<body style="display:flex;flex-direction:column;height:100%">
	<div style="display:flex;align-items:center;gap:10px;padding:22px 20px">
		<div style="color:#6f6e77;font-size:18px">←</div>
		<div style="font-weight:600;font-size:16px">morning run</div>
	</div>
	<div style="display:flex;flex-direction:column;align-items:center;padding:26px 0 10px">
		<svg width="150" height="150" viewBox="0 0 100 100">
			<circle cx="50" cy="50" r="42" fill="none" stroke="#f1eefc" stroke-width="9"/>
			<circle class="ring-fg" cx="50" cy="50" r="42" fill="none" stroke="#6e56cf" stroke-width="9"
				stroke-linecap="round" transform="rotate(-90 50 50)"/>
			<text x="50" y="47" text-anchor="middle" font-size="17" font-weight="700" fill="#1a1523">75%</text>
			<text x="50" y="62" text-anchor="middle" font-size="8" fill="#6f6e77">this month</text>
		</svg>
		<div style="margin-top:14px;font-size:13.5px;color:#6f6e77">12 day streak · best 21</div>
	</div>
	<div style="padding:18px 24px">
		<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:8px">
			${Array.from({ length: 28 }, (_, i) => `<div style="aspect-ratio:1;border-radius:7px;background:${i % 7 === 3 || i === 20 ? "#f1eefc" : "#6e56cf"};opacity:${i > 23 ? 0.25 : 1}"></div>`).join("")}
		</div>
	</div>
	<div style="margin-top:auto;padding:0 20px 30px">
		<button class="btn btn-primary" style="width:100%;padding:15px;font-size:15px" onclick="this.textContent='logged ✓'">log today</button>
	</div>
</body>`;

const statsdesk = `${base}
<style>
	@keyframes grow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
	.bar { transform-origin: bottom; animation: grow 0.9s cubic-bezier(0.22, 1, 0.36, 1) backwards; }
</style>
<body style="display:flex;height:100%;background:#fafafa">
	<div style="width:210px;background:#fff;border-right:1px solid #eeedf2;padding:22px 14px;display:flex;flex-direction:column;gap:4px">
		<div style="display:flex;align-items:center;gap:9px;padding:0 8px 18px">
			<div style="width:26px;height:26px;border-radius:8px;background:#6e56cf"></div>
			<div style="font-weight:700;font-size:15px">loops</div>
		</div>
		${["overview", "loops", "calendar", "friends", "settings"].map((l, i) => `<div style="padding:9px 10px;border-radius:8px;font-size:13.5px;${i === 0 ? "background:#f1eefc;color:#6e56cf;font-weight:600" : "color:#6f6e77"}">${l}</div>`).join("")}
	</div>
	<div style="flex:1;padding:26px 30px;overflow:hidden">
		<h1 style="font-size:21px;letter-spacing:-0.3px;margin-bottom:18px">overview</h1>
		<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:18px">
			${[["current streak", "12d"], ["loops closed", "312"], ["completion", "87%"], ["best week", "28/28"]].map(([l, v]) => `
				<div style="background:#fff;border:1px solid #eeedf2;border-radius:12px;padding:14px 16px">
					<div style="font-size:12px;color:#6f6e77">${l}</div>
					<div style="font-size:22px;font-weight:700;letter-spacing:-0.4px;margin-top:4px">${v}</div>
				</div>`).join("")}
		</div>
		<div style="background:#fff;border:1px solid #eeedf2;border-radius:12px;padding:18px 20px">
			<div style="font-size:13.5px;font-weight:600;margin-bottom:14px">closed loops · last 14 days</div>
			<div style="display:flex;align-items:flex-end;gap:7px;height:130px">
				${[60, 80, 45, 90, 100, 70, 85, 30, 95, 100, 65, 80, 100, 90].map((h, i) => `<div class="bar" style="flex:1;height:${h}%;background:${h === 100 ? "#6e56cf" : "#d8d0f5"};border-radius:6px 6px 3px 3px;animation-delay:${i * 45}ms"></div>`).join("")}
			</div>
		</div>
	</div>
</body>`;

const buttons = `${base}
<body style="padding:24px;display:flex;flex-direction:column;gap:18px">
	<div style="font-size:12px;font-weight:700;color:#6f6e77;letter-spacing:0.4px;text-transform:uppercase">buttons</div>
	<div style="display:flex;gap:10px;align-items:center">
		<button class="btn btn-primary" style="padding:11px 18px;font-size:14px">primary</button>
		<button class="btn btn-secondary" style="padding:11px 18px;font-size:14px">secondary</button>
		<button class="btn btn-ghost" style="padding:11px 18px;font-size:14px">ghost</button>
	</div>
	<div style="display:flex;gap:10px;align-items:center">
		<button class="btn btn-primary" style="padding:8px 13px;font-size:13px">small</button>
		<button class="btn btn-primary" style="padding:14px 22px;font-size:15px">large</button>
		<button class="btn btn-primary" style="padding:11px 18px;font-size:14px" disabled>disabled</button>
	</div>
	<div style="display:flex;gap:10px;align-items:center">
		<input placeholder="input" style="padding:10px 13px;border:1px solid #e4e2e9;border-radius:9px;font:inherit;font-size:13.5px;flex:1">
		<div style="width:44px;height:26px;border-radius:13px;background:#6e56cf;position:relative;flex-shrink:0">
			<div style="position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:#fff"></div>
		</div>
	</div>
</body>`;

// --- new kinds: continuous work + mutable state -----------------------------

// rAF canvas particle sim — the heavy end of what an agent might drop on the canvas.
const particles = `${base}
<body style="height:100%;background:#14121f;display:flex;flex-direction:column">
	<div style="padding:20px 20px 12px;color:#fff">
		<div style="font-weight:700;font-size:17px">particles</div>
		<div style="font-size:12.5px;color:#9a97ab;margin-top:3px">rAF canvas sim · <span id="count">120</span> points</div>
	</div>
	<canvas id="sim" style="flex:1;width:100%"></canvas>
	<script>
		const cv = document.getElementById("sim");
		const ctx = cv.getContext("2d");
		const fit = () => { cv.width = cv.clientWidth; cv.height = cv.clientHeight; };
		fit(); addEventListener("resize", fit);
		const N = 120;
		const ps = Array.from({ length: N }, () => ({
			x: Math.random() * 390, y: Math.random() * 700,
			vx: (Math.random() - 0.5) * 1.6, vy: (Math.random() - 0.5) * 1.6,
		}));
		const step = () => {
			ctx.fillStyle = "#14121f";
			ctx.fillRect(0, 0, cv.width, cv.height);
			ctx.fillStyle = "#8f7ae8";
			for (const p of ps) {
				p.x += p.vx; p.y += p.vy;
				if (p.x < 0 || p.x > cv.width) p.vx *= -1;
				if (p.y < 0 || p.y > cv.height) p.vy *= -1;
				ctx.beginPath(); ctx.arc(p.x, p.y, 2.2, 0, 6.283); ctx.fill();
			}
			requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	</script>
</body>`;

// rAF-driven vertical marquee — continuous layout/paint work in plain DOM.
const ticker = `${base}
<body style="height:100%;background:#fafafa;display:flex;flex-direction:column;overflow:hidden">
	<div style="padding:22px 20px 12px">
		<div style="font-weight:700;font-size:17px">activity</div>
		<div style="font-size:12.5px;color:#6f6e77;margin-top:3px">rAF marquee · live feed</div>
	</div>
	<div style="flex:1;overflow:hidden;position:relative">
		<div id="feed" style="position:absolute;left:0;right:0;display:flex;flex-direction:column;gap:8px;padding:0 16px"></div>
	</div>
	<script>
		const names = ["ada", "linus", "grace", "edsger", "barbara", "alan", "margaret", "dennis"];
		const acts = ["closed a loop", "hit a 30-day streak", "joined loops", "logged morning run", "shared stats"];
		const feed = document.getElementById("feed");
		const row = (i) => {
			const d = document.createElement("div");
			d.style.cssText = "display:flex;align-items:center;gap:12px;padding:12px 14px;background:#fff;border:1px solid #eeedf2;border-radius:12px";
			d.innerHTML = '<div style="width:30px;height:30px;border-radius:50%;background:#f1eefc;flex-shrink:0"></div>'
				+ '<div style="font-size:13px"><b>' + names[i % names.length] + '</b> ' + acts[i % acts.length]
				+ '<div style="color:#6f6e77;font-size:11.5px;margin-top:2px">' + (i % 59) + 's ago</div></div>';
			return d;
		};
		for (let i = 0; i < 14; i++) feed.appendChild(row(i));
		let y = 0, n = 14;
		const step = () => {
			y -= 0.6;
			const first = feed.firstElementChild;
			if (first && -y > first.offsetHeight + 8) {
				y += first.offsetHeight + 8;
				first.remove();
				feed.appendChild(row(n++));
			}
			feed.style.transform = "translateY(" + y + "px)";
			requestAnimationFrame(step);
		};
		requestAnimationFrame(step);
	</script>
</body>`;

// Interval-driven SVG rebuild — DOM churn without rAF.
const livechart = `${base}
<body style="height:100%;background:#fff;display:flex;flex-direction:column">
	<div style="padding:22px 20px 8px">
		<div style="font-weight:700;font-size:17px">throughput</div>
		<div style="font-size:12.5px;color:#6f6e77;margin-top:3px">rebuilds 24 bars every 250ms</div>
	</div>
	<div id="chart" style="flex:1;display:flex;align-items:flex-end;gap:5px;padding:16px 20px 26px"></div>
	<script>
		const chart = document.getElementById("chart");
		const vals = Array.from({ length: 24 }, () => 30 + Math.random() * 70);
		setInterval(() => {
			vals.shift();
			vals.push(30 + Math.random() * 70);
			chart.innerHTML = vals.map((v) =>
				'<div style="flex:1;height:' + v.toFixed(1) + '%;background:' + (v > 85 ? "#6e56cf" : "#d8d0f5") + ';border-radius:5px 5px 2px 2px"></div>'
			).join("");
		}, 250);
	</script>
</body>`;

// Mutable in-frame state — THE state-survival demo: type here, then watch what each
// lifecycle policy does to it (warm keeps it, snapshot remount destroys it).
const todo = `${base}
<body style="height:100%;background:#fafafa;display:flex;flex-direction:column">
	<div style="padding:26px 20px 10px">
		<div style="font-weight:700;font-size:17px">scratchpad</div>
		<div style="font-size:12.5px;color:#6f6e77;margin-top:3px">state lives in this frame — remounts eat it</div>
	</div>
	<div style="display:flex;gap:8px;padding:8px 16px">
		<input id="inp" placeholder="add item…" style="flex:1;padding:12px 14px;border:1px solid #e4e2e9;border-radius:10px;font:inherit;font-size:14px;outline-color:#6e56cf">
		<button id="add" class="btn btn-primary" style="padding:12px 16px;font-size:14px">add</button>
	</div>
	<div id="list" style="flex:1;display:flex;flex-direction:column;gap:8px;padding:10px 16px;overflow:auto"></div>
	<script>
		const list = document.getElementById("list");
		const inp = document.getElementById("inp");
		const push = (text) => {
			const d = document.createElement("div");
			d.style.cssText = "display:flex;align-items:center;gap:10px;padding:12px 14px;background:#fff;border:1px solid #eeedf2;border-radius:11px;font-size:14px";
			d.innerHTML = '<span style="flex:1"></span><span style="color:#6f6e77;cursor:pointer">✕</span>';
			d.firstElementChild.textContent = text;
			d.lastElementChild.onclick = () => d.remove();
			list.appendChild(d);
		};
		["morning pages", "water the monstera"].forEach(push);
		document.getElementById("add").onclick = () => { if (inp.value.trim()) { push(inp.value.trim()); inp.value = ""; } };
		inp.addEventListener("keydown", (e) => { if (e.key === "Enter") document.getElementById("add").click(); });
	</script>
</body>`;

const screens: Record<ScreenKind, string> = { login, clock, habit, statsdesk, buttons, todo, particles, ticker, livechart };

// --- instrumentation ---------------------------------------------------------

const agent = (id: string) => `<script>
(() => {
	const ID = ${JSON.stringify(id)};
	let ticks = 0;
	let lastReport = performance.now();
	const loop = () => { ticks++; requestAnimationFrame(loop); };
	requestAnimationFrame(loop);
	setInterval(() => {
		// normalize to a rate: throttled intervals fire late (several seconds of
		// ticks in one report) or in coalesced bursts (division by ~1 ms explodes)
		const now = performance.now();
		const elapsed = now - lastReport;
		if (elapsed < 250) return; // burst — keep accumulating
		const tps = Math.round((ticks * 1000) / elapsed);
		parent.postMessage({ spool: "ticks", id: ID, ticks: tps }, "*");
		ticks = 0;
		lastReport = now;
	}, 1000);
	parent.postMessage({ spool: "loaded", id: ID }, "*");

	async function selfCapture() {
		const W = document.documentElement.clientWidth || innerWidth;
		const H = document.documentElement.clientHeight || innerHeight;
		const clone = document.documentElement.cloneNode(true);
		clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
		const srcInputs = document.querySelectorAll("input, textarea");
		const dstInputs = clone.querySelectorAll("input, textarea");
		srcInputs.forEach((el, i) => { const d = dstInputs[i]; if (d) d.setAttribute("value", el.value); });
		const srcCanvas = document.querySelectorAll("canvas");
		const dstCanvas = clone.querySelectorAll("canvas");
		srcCanvas.forEach((c, i) => {
			const d = dstCanvas[i]; if (!d) return;
			const img = document.createElement("img");
			img.setAttribute("src", c.toDataURL());
			img.setAttribute("style", (c.getAttribute("style") || "") + ";width:" + c.clientWidth + "px;height:" + c.clientHeight + "px");
			d.parentNode.replaceChild(img, d);
		});
		clone.querySelectorAll("script").forEach((s) => s.remove());
		const xml = new XMLSerializer().serializeToString(clone);
		const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + W + '" height="' + H + '">'
			+ '<foreignObject width="100%" height="100%">' + xml + "</foreignObject></svg>";
		const img = new Image();
		img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
		await img.decode();
		const cv = document.createElement("canvas");
		cv.width = W; cv.height = H;
		const ctx = cv.getContext("2d");
		ctx.fillStyle = "#fff";
		ctx.fillRect(0, 0, W, H);
		ctx.drawImage(img, 0, 0);
		return cv.toDataURL("image/png");
	}

	addEventListener("message", async (e) => {
		const m = e.data;
		if (!m || m.spool !== "capture") return;
		const t0 = performance.now();
		try {
			const url = await selfCapture();
			parent.postMessage({ spool: "shot", id: ID, url, ms: performance.now() - t0 }, "*");
		} catch (err) {
			parent.postMessage({ spool: "shot", id: ID, error: String(err), ms: performance.now() - t0 }, "*");
		}
	});
})();
</script>`;

export function instrument(kind: ScreenKind, id: string): string {
	const html = screens[kind];
	const tag = agent(id);
	return html.includes("</body>") ? html.replace("</body>", `${tag}</body>`) : html + tag;
}

export const rawScreens = screens;
