// srcdoc HTML for the fake "loops" habit app rendered inside every frame.
// Static-ish screens with just enough JS/animation to prove the frames are live documents.

import type { ScreenId } from "./scene";

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

const today = `${base}
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

const stats = `${base}
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

export const screens: Record<ScreenId, string> = { login, today, habit, stats, buttons };
