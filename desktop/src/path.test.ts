import assert from "node:assert/strict";
import test from "node:test";
import { askLoginShell, merged, shellOf, userPath } from "./path";

const GUI = "/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";
const SHELL = "/Users/someone/.local/bin:/opt/homebrew/bin:/usr/bin:/bin";

test("the shell is the one the person chose, and a real path when it is not", () => {
	assert.equal(shellOf({ SHELL: "/opt/homebrew/bin/fish" }), "/opt/homebrew/bin/fish");
	// launchd can hand an app no SHELL at all, and `sh` reads none of the files
	// that set a PATH on a Mac
	const fallback = process.platform === "darwin" ? "/bin/zsh" : "/bin/sh";
	assert.equal(shellOf({}), fallback);
	assert.equal(shellOf({ SHELL: "zsh" }), fallback);
});

test("the shell's directories go in front, once each, keeping the app's own", () => {
	assert.equal(
		merged(GUI, SHELL),
		"/Users/someone/.local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/local/bin:/usr/sbin:/sbin",
	);
});

test("an empty entry is dropped rather than carried into a daemon", () => {
	assert.equal(merged("/usr/bin", "/opt/bin::/usr/bin"), "/opt/bin:/usr/bin");
});

test("a shell that answered nothing new leaves the environment alone", () => {
	assert.equal(merged(GUI, undefined), undefined);
	assert.equal(merged(GUI, GUI), undefined);
	assert.equal(merged(GUI, "/usr/bin:/bin"), undefined);
});

test("a machine with nothing extra on it is asked and left as it was", () => {
	assert.equal(
		userPath({ PATH: GUI }, () => GUI),
		undefined,
	);
});

test("a machine with an agent outside the launch PATH gets it", () => {
	const path = userPath({ PATH: GUI, SHELL: "/bin/zsh" }, () => SHELL);
	// win32 has the user's own PATH already and is deliberately never asked
	if (process.platform === "win32") {
		assert.equal(path, undefined);
		return;
	}
	assert.equal(path?.startsWith("/Users/someone/.local/bin:"), true);
});

test("a real shell answers with a PATH, marker and braces intact", { skip: process.platform === "win32" }, () => {
	// the regression this guards: the marker is a legal variable-name character, so
	// an unbraced `$PATH` beside it reads as a name nothing set and every machine
	// answers empty
	const answered = askLoginShell("/bin/sh");
	assert.equal(typeof answered, "string");
	assert.equal((answered ?? "").includes("/bin"), true);
	assert.equal((answered ?? "").includes("__spool_path__"), false);
});
