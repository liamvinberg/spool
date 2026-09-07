import { fork } from "node:child_process";
import { once } from "node:events";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it, onTestFinished } from "vitest";
import { makeTempDir, writeFrame } from "../test-helpers";

for (const loss of ["host", "daemon"] as const) {
	for (const stage of [
		"before-prepare",
		"before-replace",
		"after-replace",
		"before-acknowledge",
		"after-acknowledge",
	]) {
		it(`does not replay real ${loss} process loss at ${stage}`, { timeout: 30_000 }, async () => {
			const root = makeTempDir(),
				directory = makeTempDir();
			writeFrame(root, "home", "export default function Home(){return <p>Original body</p>}");
			const child = fork(fileURLToPath(new URL("./fixtures/source-owner-process.ts", import.meta.url)), [], {
				env: { ...process.env, SPOOL_TEST_ROOT: root, SPOOL_TEST_STATE: directory, SPOOL_TEST_STAGE: stage },
				execArgv: ["--import", import.meta.resolve("tsx")],
				stdio: ["ignore", "ignore", "pipe", "ipc"],
			});
			const messages: { kind: string; url?: string; name?: string; host?: number }[] = [];
			let errors = "";
			child.stderr?.on("data", (data: Buffer) => {
				errors += data.toString();
			});
			child.on("message", (message) => messages.push(message as (typeof messages)[number]));
			onTestFinished(async () => {
				if (child.exitCode === null && child.signalCode === null) {
					const exited = once(child, "exit");
					child.kill("SIGKILL");
					await exited;
				}
			});
			await expect
				.poll(
					() => {
						if (child.exitCode !== null) throw new Error(errors);
						return messages.find((m) => m.kind === "ready")?.url;
					},
					{ timeout: 20_000 },
				)
				.toBeTruthy();
			const url = messages.find((m) => m.kind === "ready")?.url;
			if (!url) throw new Error("missing daemon URL");
			let result: unknown;
			const response = fetch(url)
				.then((r) => r.json())
				.then((value: unknown) => {
					result = value;
					return value;
				})
				.catch(() => undefined);
			await expect
				.poll(
					() => {
						if (result) throw new Error(JSON.stringify(result));
						return messages.some((m) => m.kind === "checkpoint");
					},
					{ timeout: 20_000 },
				)
				.toBe(true);
			if (loss === "daemon") {
				const exited = once(child, "exit");
				child.kill("SIGKILL");
				await exited;
			} else child.send({ kind: "kill-host" });
			await response;
			if (loss === "daemon") {
				const host = messages.find((m) => m.kind === "checkpoint")?.host;
				if (host)
					await expect
						.poll(
							() => {
								try {
									process.kill(host, 0);
									return false;
								} catch {
									return true;
								}
							},
							{ timeout: 10_000 },
						)
						.toBe(true);
			}
			const replaced = ["after-replace", "before-acknowledge", "after-acknowledge"].includes(stage);
			expect(readFileSync(join(root, "design/frames/home/frame.tsx"), "utf8")).toContain(
				replaced ? "Agent body" : "Original body",
			);
			const calls = readFileSync(join(directory, "provider-calls.jsonl"), "utf8");
			expect(calls).not.toContain('"handle"');
			expect(calls).not.toContain('"generation"');
		});
	}
}
