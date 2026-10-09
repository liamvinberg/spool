import { execFileSync } from "node:child_process";
import { mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";
import type { BrowserContext } from "playwright-core";
import { expect, it } from "vitest";
import { initTeamProject } from "../init";
import { decodeFrame, encodeFrame, PROTOCOL_VERSION, type PresenceState } from "../team-sync-protocol";
import { fakeTeam, TEAM_ORIGIN } from "../team-sync-test-harness";
import { testBrowser } from "../test-browser";
import { builtUi, closeAfterTest, makeTempDir, pagePointOf, writeDesignFile, writeFrame } from "../test-helpers";
import { serveDaemon } from "./server";
import { syncUrl } from "./team-sync";

/**
 * PROTOTYPE demo, not a test (task 94): Liam drives his real canvas inside a live frame with a real mouse; what
 * his canvas says goes up to the fake team, is heard on a socket, and is said to Cata's own canvas, which is
 * recorded. Run by hand: `DEMO_OUT=/tmp/x pnpm vitest run src/daemon/presence-inside-demo.test.ts`.
 */

const OUT = process.env.DEMO_OUT ?? "";
const LIAM = { accountId: "liam", name: "Liam", color: "#7aa7ff" };
const VIEW = { width: 860, height: 820 };
const INBOX = { x: 0, y: 0, w: 390, h: 700 };
const DETAIL = { x: 480, y: 0, w: 390, h: 700 };

const INBOX_SOURCE = `const rows = [
  ["Ana Lopez", "Q3 roadmap review", "Can we move the sync to Thursday? I'd like Ben there."],
  ["Ben Ito", "Re: onboarding flow", "Left notes on step three, the empty state reads oddly."],
  ["Cleo Park", "Design crit", "Frames are up on the team canvas, have a look."],
  ["Devosurf", "Your invoice", "Receipt for October is attached."],
  ["Eli Moss", "Lunch?", "Pho place on Götgatan at 12?"],
  ["Fia Berg", "Spool feedback", "The walk mode is lovely. One thing about arrows..."],
  ["Gus Hale", "Contract draft", "Second pass with the legal edits."],
  ["Hana Ota", "Standup notes", "Blocked on the API key, otherwise on track."],
  ["Ivo Rask", "Re: icons", "Exported at 1x and 2x, in the drive."],
  ["Jon Ek", "Offsite", "Hotel is booked, agenda to follow."],
  ["Kim Sato", "Bug: scroll jump", "Repro steps in the ticket."],
  ["Lea Holm", "Hiring", "Two portfolios worth a look."],
  ["Mo Diaz", "Re: pricing page", "Annual toggle default should be on."],
  ["Nils Kron", "Weekly digest", "Five frames changed, two new flows."],
  ["Ola Vik", "Release 1.4", "Notes drafted, need a proofread."],
];
export default function Frame() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", background: "#fff", color: "#111", minHeight: "100vh" }}>
      <header style={{ position: "sticky", top: 0, background: "#fff", padding: "18px 18px 10px", borderBottom: "1px solid #eee" }}>
        <div style={{ fontSize: 26, fontWeight: 700 }}>Inbox</div>
        <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
          {["All", "Unread", "Flagged", "Archive"].map((t, i) => (
            <button key={t} style={{ border: 0, borderRadius: 99, padding: "6px 12px", background: i === 0 ? "#111" : "#f1f1f1", color: i === 0 ? "#fff" : "#333", fontSize: 13 }}>{t}</button>
          ))}
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12, fontSize: 13, color: "#555" }}>
          Snooze <input type="range" min="0" max="100" defaultValue="20" style={{ flex: 1 }} />
        </label>
      </header>
      {rows.map(([from, subject, body]) => (
        <div key={subject} style={{ padding: "14px 18px", borderBottom: "1px solid #f0f0f0", display: "flex", gap: 12 }}>
          <div style={{ width: 36, height: 36, borderRadius: 99, background: "#e8e4ff", flex: "none", display: "grid", placeItems: "center", fontWeight: 600, color: "#5a4bd1" }}>{from[0]}</div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 15 }}>{from}</div>
            <div style={{ fontSize: 14 }}>{subject}</div>
            <div style={{ fontSize: 13, color: "#777", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{body}</div>
          </div>
        </div>
      ))}
    </main>
  );
}
`;

const DETAIL_SOURCE = `export default function Frame() {
  return (
    <main style={{ fontFamily: "system-ui, sans-serif", padding: 18, background: "#fff", color: "#111", minHeight: "100vh" }}>
      <div style={{ fontSize: 13, color: "#777" }}>Cleo Park</div>
      <div style={{ fontSize: 22, fontWeight: 700, margin: "6px 0 14px" }}>Design crit</div>
      <p style={{ fontSize: 15, lineHeight: 1.5 }}>Frames are up on the team canvas, have a look.</p>
      <button style={{ marginTop: 18, border: 0, borderRadius: 10, padding: "12px 18px", background: "#5a4bd1", color: "#fff", fontSize: 15 }}>Reply</button>
    </main>
  );
}
`;

async function canvasOf(cloud: ReturnType<typeof fakeTeam>, who: string, folder: string) {
	const machine = cloud.machine(who);
	const spoolDir = join(makeTempDir(), ".spool");
	const checkout = join(makeTempDir(), folder);
	mkdirSync(checkout);
	execFileSync("git", ["init", "--quiet", "."], { cwd: checkout });
	const { root, link } = await initTeamProject(realpathSync(checkout), spoolDir, {
		team: "devosurf",
		origin: TEAM_ORIGIN,
		request: machine.request,
		openSocket: machine.openSocket,
	});
	writeFrame(root, "inbox", INBOX_SOURCE);
	writeDesignFile(root, "frames/inbox/frame.json", `${JSON.stringify(INBOX)}\n`);
	writeFrame(root, "detail", DETAIL_SOURCE);
	writeDesignFile(root, "frames/detail/frame.json", `${JSON.stringify(DETAIL)}\n`);
	writeDesignFile(root, ".spool/state.json", `${JSON.stringify({ camera: { x: 0, y: 60, k: 0.98 } })}\n`);
	const daemon = await serveDaemon({
		spoolDir,
		version: "0.0.0-test",
		host: "127.0.0.1",
		port: 0,
		uiDir: await builtUi(),
		cloud: machine.cloud,
		teamNotice: () => {},
	});
	closeAfterTest(daemon);
	return { machine, daemon, link, folder };
}

it.skipIf(OUT === "")("records Cata's canvas while Liam works inside a live frame", { timeout: 300_000 }, async () => {
	mkdirSync(OUT, { recursive: true });
	const cloud = fakeTeam();
	const liam = await canvasOf(cloud, "liam", "inbox-app");
	const cata = await canvasOf(cloud, "cata", "inbox-app-cata");

	// a socket of Cata's on Liam's project hears where Liam is, and says it to her own canvas
	const heard: PresenceState[] = [];
	const token = await cata.machine.cloud.vault.read();
	const socket = cata.machine.openSocket(syncUrl(liam.link), token, {
		open: () => socket.send(encodeFrame({ type: "hello", protocol: PROTOCOL_VERSION, format: 2, since: 0 })),
		message: (data) => {
			const message = decodeFrame(data)?.message;
			if (message?.type !== "presence" || message.state === null) return;
			heard.push(message.state as PresenceState);
			cloud.forge("inbox-app-cata", { type: "presence", person: LIAM, state: message.state, still: 0 });
		},
		close: () => {},
	});

	const browser = await testBrowser();
	const open = async (url: string, name: string) => {
		const context: BrowserContext = await browser.newContext({
			viewport: VIEW,
			deviceScaleFactor: 1,
			recordVideo: { dir: join(OUT, name), size: VIEW },
		});
		const page = await context.newPage();
		const born = Date.now();
		await page.goto(url);
		await page.locator('[data-frame-label="inbox"]').waitFor({ timeout: 30_000 });
		return { page, context, born };
	};
	const [driver, watcher] = await Promise.all([
		open(`${liam.daemon.url}/p/inbox-app`, "liam"),
		open(`${cata.daemon.url}/p/inbox-app-cata?presence=morph`, "cata"),
	]);
	await new Promise((resolve) => setTimeout(resolve, 3000));

	// Liam's own pointer, drawn on his recording, since a headless one never is
	await driver.page.evaluate(() => {
		const dot = document.createElement("div");
		dot.id = "demo-pointer";
		dot.innerHTML =
			'<svg width="18" height="22" viewBox="0 0 16 20"><path d="M1.2 1.2v14.6l3.9-3.7 2.7 6.1 2.6-1.1-2.7-6h5.5Z" fill="#fff" stroke="#000" stroke-width="1.2"/></svg>';
		Object.assign(dot.style, { position: "fixed", left: "0", top: "0", zIndex: "99999", pointerEvents: "none" });
		document.body.append(dot);
	});
	let mouse = { x: 700, y: 760 };
	const show = (at: { x: number; y: number }) =>
		driver.page.evaluate(({ x, y }) => {
			const dot = document.getElementById("demo-pointer");
			if (dot !== null) dot.style.transform = `translate(${x - 1}px, ${y - 1}px)`;
		}, at);
	const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
	const glide = async (to: { x: number; y: number }, ms = 700) => {
		const from = mouse;
		const steps = Math.max(8, Math.round(ms / 16));
		for (let i = 1; i <= steps; i++) {
			const t = i / steps;
			const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
			const at = { x: from.x + (to.x - from.x) * e, y: from.y + (to.y - from.y) * e };
			await driver.page.mouse.move(at.x, at.y);
			await show(at);
			await pause(ms / steps);
		}
		mouse = to;
	};
	const click = async () => {
		await driver.page.mouse.down();
		await pause(90);
		await driver.page.mouse.up();
	};
	const world = (x: number, y: number) => pagePointOf(driver.page, { x, y });
	await show(mouse);

	const inbox = () => {
		const frame = driver.page
			.frames()
			.find((one) => one !== driver.page.mainFrame() && /inbox(?!-app)/u.test(one.url()));
		if (frame === undefined) throw new Error("no inbox frame");
		return frame;
	};
	const centre = async (selector: string, nth = 0, dx = 0) => {
		const found = await inbox().locator(selector).nth(nth).boundingBox();
		if (found === null) throw new Error(`no ${selector}`);
		return { x: found.x + found.width / 2 + dx, y: found.y + found.height / 2 };
	};
	const wheel = async (dy: number, ticks: number) => {
		for (let i = 0; i < ticks; i++) {
			await driver.page.mouse.wheel(0, dy);
			await pause(45);
		}
	};
	const events: { what: string; at: number }[] = [];
	const note = (what: string) => events.push({ what, at: (Date.now() - start) / 1000 });
	const routine = async () => {
		await glide(await centre("button", 1), 650);
		await pause(150);
		note("click");
		await click();
		await pause(650);
		await glide(await centre("button", 3), 550);
		await click();
		await pause(650);
		const slider = await inbox().locator("input[type=range]").boundingBox();
		if (slider === null) throw new Error("no slider");
		const thumb = { x: slider.x + slider.width * 0.2, y: slider.y + slider.height / 2 };
		await glide(thumb, 600);
		await driver.page.mouse.down();
		await pause(120);
		note("drag");
		await glide({ x: slider.x + slider.width * 0.85, y: thumb.y + 4 }, 800);
		await glide({ x: slider.x + slider.width * 0.2, y: thumb.y }, 600);
		await pause(120);
		await driver.page.mouse.up();
		await pause(500);
		await glide({ x: thumb.x + 30, y: thumb.y + 260 }, 600);
		await pause(200);
		note("scroll");
		await wheel(45, 22);
		await pause(700);
		await wheel(-60, 17);
		await pause(900);
	};
	// in, the way a person goes in
	await glide(await world(200, 360), 900);
	await driver.page.mouse.dblclick(mouse.x, mouse.y);
	await pause(900);
	const start = Date.now();
	const marks: { variant: string; at: number }[] = [];
	for (const variant of ["morph", "trail", "touch", "badge"]) {
		marks.push({ variant, at: (Date.now() - start) / 1000 });
		await routine();
		if (variant !== "badge") {
			await watcher.page.locator("[data-presence-variant-bar] button").last().click();
			await pause(600);
		}
	}
	const end = Date.now();
	await expect.poll(() => heard.some((state) => state.inside === "inbox" && (state.clicks ?? 0) > 0)).toBe(true);

	const [liamVideo, cataVideo] = [await driver.page.video()?.path(), await watcher.page.video()?.path()];
	await driver.context.close();
	await watcher.context.close();
	console.log(
		JSON.stringify({
			liam: { video: liamVideo, skip: (start - driver.born) / 1000 },
			cata: { video: cataVideo, skip: (start - watcher.born) / 1000 },
			length: (end - start) / 1000,
			marks,
			events,
			heard: heard.length,
			sample: heard.filter((s) => s.inside !== null).slice(-3),
		}),
	);
});
