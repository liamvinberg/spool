import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

const SCRIPT = join(__dirname, "../scripts/bundle-cli.sh");

function executable(directory: string, name: string, body: string): string {
	const path = join(directory, name);
	writeFileSync(path, `#!/bin/bash\nset -euo pipefail\n${body}`);
	chmodSync(path, 0o755);
	return path;
}

function fixture(availableOnAttempt: number): {
	directory: string;
	env: NodeJS.ProcessEnv;
	packLog: string;
} {
	const directory = mkdtempSync(join(tmpdir(), "spool-bundle-cli-"));
	const attempts = join(directory, "attempts");
	const packLog = join(directory, "pack.log");
	const npm = executable(
		directory,
		"npm",
		`if [ "$1" = view ]; then
	attempt=0
	[ ! -f "$ATTEMPTS_FILE" ] || attempt=$(<"$ATTEMPTS_FILE")
	attempt=$((attempt + 1))
	echo "$attempt" > "$ATTEMPTS_FILE"
	[ "$attempt" -ge "$AVAILABLE_ON_ATTEMPT" ] || exit 1
	echo "$VERSION"
	exit 0
fi
prefix=""
while [ "$#" -gt 0 ]; do
	if [ "$1" = --prefix ]; then prefix="$2"; shift 2; else shift; fi
done
mkdir -p "$prefix/node_modules/spool.page/dist"
touch "$prefix/node_modules/spool.page/dist/cli.js"
`,
	);
	const sleep = executable(directory, "sleep", 'echo "$1" >> "$SLEEP_LOG"\n');
	const pnpm = executable(directory, "pnpm", 'echo "$*" >> "$PACK_LOG"\nexit 99\n');
	const node = executable(directory, "node", 'echo "$VERSION"\n');
	return {
		directory,
		packLog,
		env: {
			...process.env,
			ATTEMPTS_FILE: attempts,
			AVAILABLE_ON_ATTEMPT: String(availableOnAttempt),
			PACK_LOG: packLog,
			SLEEP_LOG: join(directory, "sleep.log"),
			VERSION: "9.8.7",
			CLI_OUT: join(directory, "stage"),
			SPOOL_RELEASE_BUILD: "1",
			SPOOL_REGISTRY_ATTEMPTS: "3",
			SPOOL_REGISTRY_RETRY_SECONDS: "0",
			SPOOL_NPM_COMMAND: npm,
			SPOOL_PNPM_COMMAND: pnpm,
			SPOOL_NODE_COMMAND: node,
			SPOOL_SLEEP_COMMAND: sleep,
		},
	};
}

test("a release waits for the exact npm version instead of packing the checkout", () => {
	const setup = fixture(3);
	try {
		const result = spawnSync(SCRIPT, { env: setup.env, encoding: "utf8" });
		assert.equal(result.status, 0, result.stderr);
		assert.match(result.stdout, /waiting for npm to serve spool\.page@9\.8\.7 \(2\/3\)/);
		assert.match(result.stdout, /installing spool\.page@9\.8\.7 from the registry/);
		assert.throws(() => readFileSync(setup.packLog));
	} finally {
		rmSync(setup.directory, { recursive: true, force: true });
	}
});

test("a release fails clearly when npm never serves the exact version", () => {
	const setup = fixture(4);
	try {
		const result = spawnSync(SCRIPT, { env: setup.env, encoding: "utf8" });
		assert.equal(result.status, 1);
		assert.match(result.stderr, /npm did not serve the exact version spool\.page@9\.8\.7/);
		assert.match(result.stderr, /refusing to build a release from the checkout/);
		assert.throws(() => readFileSync(setup.packLog));
	} finally {
		rmSync(setup.directory, { recursive: true, force: true });
	}
});
