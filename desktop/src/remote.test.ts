import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
	FIRST_RETRY_MS,
	failureReason,
	LAST_RETRY_MS,
	parseRemote,
	READY_STEP_MS,
	readRemote,
	reclaimTunnel,
	Tunnel,
	type TunnelChild,
	type TunnelClock,
	type TunnelStatus,
} from "./remote";

test("remote.json: absent is no feature, wrong is a reason, and the name defaults to the host", () => {
	const directory = mkdtempSync(join(tmpdir(), "spool-remote-"));
	try {
		assert.deepEqual(readRemote(directory), {});
		writeFileSync(join(directory, "remote.json"), '{"ssh":"liam@devobee.tail9e5223.ts.net","port":7768}');
		assert.deepEqual(readRemote(directory).config, {
			ssh: "liam@devobee.tail9e5223.ts.net",
			port: 7768,
			name: "devobee",
		});
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
	assert.deepEqual(parseRemote('{"ssh":"box","port":7768,"name":" Work "}').config, {
		ssh: "box",
		port: 7768,
		name: "Work",
	});
	assert.equal(parseRemote('{"ssh":"10.0.0.2","port":7768}').config?.name, "10.0.0.2");
	for (const wrong of [
		"{",
		"[]",
		'{"port":7768}',
		// read by ssh as an option rather than a destination
		'{"ssh":"-oProxyCommand=evil","port":7768}',
		'{"ssh":"box","port":"7768"}',
		'{"ssh":"box","port":70000}',
		'{"ssh":"box","port":7768,"name":""}',
	]) {
		const read = parseRemote(wrong);
		assert.equal(read.config, undefined, wrong);
		assert.match(read.error ?? "", /remote\.json/, wrong);
	}
});

test("ssh's stderr is said as what went wrong", () => {
	const config = { ssh: "devobee", port: 7768, name: "devobee" };
	const says = (stderr: string) => failureReason(stderr, config);
	assert.equal(
		says(
			"bind [127.0.0.1]:7768: Address already in use\nchannel_setup_fwd_listener_tcpip: cannot listen to port: 7768\nCould not request local forwarding.",
		),
		"port 7768 is already in use on this Mac",
	);
	assert.match(says("liam@devobee: Permission denied (publickey)."), /^ssh was refused/);
	assert.match(says("Host key verification failed."), /host key/);
	assert.equal(says("ssh: connect to host devobee port 22: Operation timed out"), "devobee is not answering");
	assert.equal(
		says("ssh: Could not resolve hostname devobee: nodename nor servname provided"),
		"devobee is not answering",
	);
	// the far end's port refusing is not the machine refusing, though it says "Connection refused"
	assert.equal(
		says("channel 2: open failed: connect failed: Connection refused"),
		"no spool daemon is running on port 7768 there",
	);
	assert.equal(says("something new\n"), "something new");
	assert.equal(says("Warning: remote port forwarding failed for listen port 18339\n"), "ssh stopped");
});

class FakeChild extends EventEmitter implements TunnelChild {
	pid: number;
	stderr = new EventEmitter();
	killed: NodeJS.Signals[] = [];
	constructor(pid: number) {
		super();
		this.pid = pid;
	}
	kill(signal: NodeJS.Signals = "SIGTERM"): boolean {
		this.killed.push(signal);
		return true;
	}
	die(stderr = ""): void {
		if (stderr !== "") this.stderr.emit("data", Buffer.from(stderr));
		this.emit("close", 255);
	}
}

/** Timers run by hand, in order of when they are due. */
class FakeClock implements TunnelClock {
	now = 0;
	private timers = new Map<number, { at: number; callback: () => void }>();
	private next = 0;
	setTimeout(callback: () => void, ms: number): unknown {
		const id = ++this.next;
		this.timers.set(id, { at: this.now + ms, callback });
		return id;
	}
	clearTimeout(handle: unknown): void {
		this.timers.delete(handle as number);
	}
	/** Run every timer due within ms, letting health answers settle between them. */
	async advance(ms: number): Promise<void> {
		const end = this.now + ms;
		for (;;) {
			const due = [...this.timers.entries()]
				.filter(([, timer]) => timer.at <= end)
				.sort((a, b) => a[1].at - b[1].at)[0];
			if (due === undefined) break;
			this.timers.delete(due[0]);
			this.now = due[1].at;
			due[1].callback();
			await new Promise((resolve) => setImmediate(resolve));
		}
		this.now = end;
	}
}

function harness(answers: () => boolean) {
	const clock = new FakeClock();
	const children: FakeChild[] = [];
	const spawned: { command: string; args: string[]; at: number }[] = [];
	const statuses: TunnelStatus[] = [];
	const tunnel = new Tunnel(
		{ ssh: "devobee", port: 7768, name: "devobee" },
		{
			clock,
			spawn: (command, args) => {
				spawned.push({ command, args, at: clock.now });
				const child = new FakeChild(1000 + children.length);
				children.push(child);
				return child;
			},
			health: async () => answers(),
			onStatus: (status) => statuses.push(status),
		},
	);
	return { clock, children, spawned, statuses, tunnel };
}

test("the tunnel is the forward ssh opens, connected once spool answers through it", async () => {
	let answers = false;
	const { clock, spawned, statuses, tunnel } = harness(() => answers);
	tunnel.start();
	assert.equal(spawned[0]?.command, "/usr/bin/ssh");
	assert.deepEqual(spawned[0]?.args.slice(-4), ["-L", "127.0.0.1:7768:127.0.0.1:7768", "--", "devobee"]);
	assert.ok(spawned[0]?.args.includes("ExitOnForwardFailure=no"));
	assert.ok(spawned[0]?.args.includes("BatchMode=yes"));
	await clock.advance(READY_STEP_MS * 3);
	assert.deepEqual(tunnel.status, { state: "connecting" });
	answers = true;
	await clock.advance(READY_STEP_MS);
	assert.deepEqual(tunnel.status, { state: "connected" });
	// the daemon behind a live tunnel going away is said, and its return
	answers = false;
	await clock.advance(5_000);
	assert.deepEqual(tunnel.status, { state: "failed", reason: "nothing answers on port 7768 there" });
	answers = true;
	await clock.advance(5_000);
	assert.deepEqual(statuses.at(-1), { state: "connected" });
	tunnel.stop();
});

test("a local port ssh could not bind ends that ssh, while a config RemoteForward the far end refuses does not", async () => {
	const { children, tunnel } = harness(() => false);
	tunnel.start();
	children[0]?.stderr.emit("data", Buffer.from("Warning: remote port forwarding failed for listen port 18339\n"));
	assert.deepEqual(children[0]?.killed, []);
	children[0]?.stderr.emit(
		"data",
		Buffer.from("bind [127.0.0.1]:7768: Address already in use\nCould not request local forwarding.\n"),
	);
	assert.deepEqual(children[0]?.killed, ["SIGTERM"]);
	children[0]?.die();
	assert.deepEqual(tunnel.status, { state: "failed", reason: "port 7768 is already in use on this Mac" });
	tunnel.stop();
});

test("ssh that exits is started again, waiting longer each time until a connection answers", async () => {
	let answers = false;
	const { clock, children, spawned, tunnel } = harness(() => answers);
	tunnel.start();
	const waits: number[] = [];
	for (let attempt = 0; attempt < 7; attempt++) {
		children.at(-1)?.die("ssh: connect to host devobee port 22: Operation timed out");
		assert.deepEqual(tunnel.status, { state: "failed", reason: "devobee is not answering" });
		const before = spawned.length;
		const from = clock.now;
		while (spawned.length === before) await clock.advance(250);
		waits.push((spawned.at(-1)?.at ?? 0) - from);
	}
	assert.deepEqual(waits, [1_000, 2_000, 4_000, 8_000, 16_000, LAST_RETRY_MS, LAST_RETRY_MS]);
	answers = true;
	await clock.advance(READY_STEP_MS);
	assert.deepEqual(tunnel.status, { state: "connected" });
	children.at(-1)?.die();
	const before = spawned.length;
	await clock.advance(FIRST_RETRY_MS);
	assert.equal(spawned.length, before + 1, "a healthy connection puts the wait back at a second");
	tunnel.stop();
});

test("waking from sleep starts ssh again at once, and stop ends it for good", async () => {
	const { clock, children, spawned, tunnel } = harness(() => false);
	tunnel.start();
	children[0]?.die("Connection reset by peer");
	children[0]?.die("Connection reset by peer");
	assert.equal(spawned.length, 1);
	tunnel.restart();
	assert.equal(spawned.length, 2, "no wait after a resume");
	tunnel.restart();
	assert.deepEqual(children[1]?.killed, ["SIGTERM"], "the old ssh is ended, not left beside the new one");
	// the killed child's own close arrives late and starts nothing
	children[1]?.die();
	assert.equal(spawned.length, 3);
	tunnel.stop();
	assert.deepEqual(children[2]?.killed, ["SIGTERM"]);
	children[2]?.die();
	await clock.advance(LAST_RETRY_MS * 2);
	assert.equal(spawned.length, 3);
});

test("a crashed app's ssh is ended on the next launch, and only if it is still that ssh", () => {
	const directory = mkdtempSync(join(tmpdir(), "spool-remote-"));
	const pidFile = join(directory, "remote-tunnel.pid");
	try {
		const killed: number[] = [];
		writeFileSync(pidFile, "4242\n");
		const ours = "/usr/bin/ssh -N -o BatchMode=yes -L 127.0.0.1:7768:127.0.0.1:7768 -- devobee";
		assert.equal(
			reclaimTunnel(
				pidFile,
				7768,
				() => ours,
				(pid) => killed.push(pid),
			),
			4242,
		);
		writeFileSync(pidFile, "4242\n");
		assert.equal(
			reclaimTunnel(
				pidFile,
				7768,
				() => "/Applications/Safari.app/Contents/MacOS/Safari",
				(pid) => killed.push(pid),
			),
			undefined,
		);
		assert.deepEqual(killed, [4242]);
		assert.equal(reclaimTunnel(pidFile, 7768), undefined, "the file is gone once read");
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
