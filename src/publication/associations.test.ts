import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { repoRoot, tsxBin } from "../cli-test-helpers";
import { makeTempDir } from "../test-helpers";
import {
	associationIdentity,
	claimAssociation,
	claimAssociationUpdate,
	readAssociation,
	readCapture,
} from "./associations";
import type { WebsiteArtifact } from "./build";
import { canonicalJson, sealManifest, sha256 } from "./manifest";

function artifact(): WebsiteArtifact {
	const contents = new Map([
		["index.html", ["<html></html>", "text/html"]],
		["bootstrap.js", ["export{}", "application/javascript"]],
		["player.html", ["<html></html>", "text/html"]],
		["player-bootstrap.js", ["export{}", "application/javascript"]],
		["seed.json", ["{}", "application/json"]],
		["frame.js", ["export{}", "application/javascript"]],
		["style.css", ["body{}", "text/css"]],
	] as const);
	const objects = new Map(
		[...contents].map(([path, [text, mediaType]]) => [path, { bytes: Buffer.from(text), mediaType }]),
	);
	const inventory = [...objects].map(([path, object]) => ({
		path,
		mediaType: object.mediaType,
		byteLength: object.bytes.byteLength,
		sha256: sha256(object.bytes),
	}));
	const manifest = sealManifest({
		format: 1,
		producer: { name: "spool.page", version: "test", runtimeVersion: "test" },
		entry: "start",
		scenario: "default",
		document: "index.html",
		bootstrap: "bootstrap.js",
		player: "player.html",
		playerBootstrap: "player-bootstrap.js",
		seed: "seed.json",
		frames: [
			{
				name: "start",
				width: 100,
				height: 100,
				outgoing: [],
				module: "frame.js",
				dependencies: ["frame.js", "style.css"],
				stylesheet: "style.css",
			},
		],
		objects: inventory,
		externalServices: [],
	});
	return { manifest, inputIdentity: "input", objects };
}

it("atomically converges concurrent processes on one complete association", async () => {
	const spoolDir = makeTempDir();
	const root = makeTempDir();
	const payload = join(spoolDir, "payload.json");
	const script = join(spoolDir, "claim.ts");
	const held = artifact();
	writeFileSync(
		payload,
		JSON.stringify({
			manifest: held.manifest,
			inputIdentity: held.inputIdentity,
			objects: [...held.objects].map(([path, object]) => [
				path,
				Buffer.from(object.bytes).toString("base64"),
				object.mediaType,
			]),
		}),
	);
	writeFileSync(
		script,
		`import {readFileSync} from "node:fs"; import {associationIdentity,claimAssociation} from ${JSON.stringify(join(repoRoot, "src/publication/associations.ts"))}; const p=JSON.parse(readFileSync(process.env.PAYLOAD,"utf8")); const artifact={manifest:p.manifest,inputIdentity:p.inputIdentity,objects:new Map(p.objects.map(([path,bytes,mediaType])=>[path,{bytes:Buffer.from(bytes,"base64"),mediaType}]))}; const identity=associationIdentity(process.env.STATE,"https://cloud.test","publisher",process.env.ROOT,"start","default"); console.log(JSON.stringify(claimAssociation(process.env.STATE,identity,artifact,"start",["Alex@example.com"])));`,
	);
	const run = () =>
		new Promise<string>((done, fail) => {
			const child = spawn(tsxBin, [script], {
				env: { ...process.env, STATE: spoolDir, ROOT: root, PAYLOAD: payload },
			});
			let stdout = "";
			child.stdout.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => {
				stdout += chunk;
			});
			child.on("error", fail);
			child.on("close", (code) => (code === 0 ? done(stdout) : fail(new Error(`claim exited ${code}`))));
		});
	const [one, two] = await Promise.all([run(), run()]);
	expect(JSON.parse(one)).toEqual(JSON.parse(two));
	expect(readdirSync(join(spoolDir, "publications", "associations"))).toHaveLength(1);
	expect(readdirSync(join(spoolDir, "publications", "captures"))).toHaveLength(1);
});

it("ignores a killed pre-link candidate and validates captured bytes on recovery", () => {
	const spoolDir = makeTempDir();
	const root = makeTempDir();
	const identity = associationIdentity(spoolDir, "https://cloud.test", "publisher", root, "start", "default");
	const key = createHash("sha256").update(canonicalJson(identity)).digest("hex");
	const directory = join(spoolDir, "publications", "associations");
	mkdirSync(directory, { recursive: true });
	const candidate = join(directory, `${key}.json.killed.candidate`);
	const killed = spawnSync("sh", ["-c", 'printf partial > "$1"; kill -9 $$', "sh", candidate]);
	expect(killed.signal).toBe("SIGKILL");
	const claimed = claimAssociation(spoolDir, identity, artifact(), "start", ["Alex@example.com"]);
	expect(readAssociation(spoolDir, identity)).toEqual(claimed);
	const captured = readCapture(spoolDir, claimed.intent.operationId);
	const first = captured.manifest.objects[0];
	if (first === undefined) throw new Error("missing fixture object");
	writeFileSync(
		join(spoolDir, "publications", "captures", claimed.intent.operationId, "objects", first.path),
		"corrupt",
	);
	expect(() => readCapture(spoolDir, claimed.intent.operationId)).toThrow(/missing or invalid/u);
});

it("converges concurrent update processes and rejects a different pending request", async () => {
	const spoolDir = makeTempDir();
	const root = makeTempDir();
	const held = artifact();
	const identity = associationIdentity(spoolDir, "https://cloud.test", "publisher", root, "start", "default");
	const initial = claimAssociation(spoolDir, identity, held, "start", ["Alex@example.com"]);
	const associated = {
		...initial,
		publicationId: "publication",
		hostname: "paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onspool.page",
		url: "https://paaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa.onspool.page",
	};
	const payload = join(spoolDir, "update-payload.json");
	const script = join(spoolDir, "update.ts");
	writeFileSync(
		payload,
		JSON.stringify({
			association: associated,
			manifest: held.manifest,
			inputIdentity: held.inputIdentity,
			objects: [...held.objects].map(([path, object]) => [
				path,
				Buffer.from(object.bytes).toString("base64"),
				object.mediaType,
			]),
		}),
	);
	writeFileSync(
		script,
		`import {readFileSync} from "node:fs"; import {claimAssociationUpdate} from ${JSON.stringify(join(repoRoot, "src/publication/associations.ts"))}; const p=JSON.parse(readFileSync(process.env.PAYLOAD,"utf8")); const artifact={manifest:p.manifest,inputIdentity:p.inputIdentity,objects:new Map(p.objects.map(([path,bytes,mediaType])=>[path,{bytes:Buffer.from(bytes,"base64"),mediaType}]))}; console.log(JSON.stringify(claimAssociationUpdate(process.env.STATE,p.association,artifact,1,1,["New@example.com"])));`,
	);
	const run = () =>
		new Promise<string>((done, fail) => {
			const child = spawn(tsxBin, [script], { env: { ...process.env, STATE: spoolDir, PAYLOAD: payload } });
			let stdout = "";
			child.stdout.setEncoding("utf8");
			child.stdout.on("data", (chunk: string) => (stdout += chunk));
			child.on("error", fail);
			child.on("close", (code) => (code === 0 ? done(stdout) : fail(new Error(`update exited ${code}`))));
		});
	const [one, two] = await Promise.all([run(), run()]);
	expect(JSON.parse(one).intent.operationId).toBe(JSON.parse(two).intent.operationId);
	expect(() => claimAssociationUpdate(spoolDir, associated, held, 1, 1, ["Other@example.com"])).toThrow(
		/already in progress/u,
	);
});
