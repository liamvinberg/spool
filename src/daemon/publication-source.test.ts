import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { makeProject, makeTempDir, writeDesignFile, writeFrame } from "../test-helpers";
import { createFlowGraph } from "./flows";
import { publicationReadiness } from "./publication-readiness";

async function check(source: string, shared: Record<string, string> = {}) {
	const { root } = makeProject(join(makeTempDir(), ".spool"));
	writeFrame(root, "start", source);
	for (const name of ["next", "other"]) writeFrame(root, name, "export default () => null;");
	writeFrame(root, "draft", "not parseable {{}");
	for (const [path, text] of Object.entries(shared)) writeDesignFile(root, path, text);
	return publicationReadiness(createFlowGraph(), root, "start");
}

describe("publication source attribution", () => {
	it("selects only used same-line exports and JSX components", async () => {
		const result = await check('import { Used } from "shared/ui/nav"; export default () => <Used />;', {
			"shared/ui/nav.tsx":
				'export const Used = () => <a data-go="next"/>; export const Unused = () => <a data-go="secret"/>;',
		});
		expect(result.ok).toBe(true);
		expect(result.included).toEqual(["start", "next"]);
	});
	it("does not follow property names or type-only imports", async () => {
		const result = await check(
			'import type { Bad } from "shared/bad"; import { unused } from "shared/ui/nav"; const object = { unused: "text" }; export default () => <div>{object.unused}</div>;',
			{
				"shared/bad.ts": "broken {{{",
				"shared/ui/nav.tsx": 'export const unused = () => <a data-go="secret"/>;',
			},
		);
		expect(result.ok).toBe(true);
		expect(result.included).toEqual(["start"]);
	});
	it("recognizes Spool aliases and ignores unrelated shadowing", async () => {
		const result = await check(
			'import { ui as navigation } from "spool"; function unrelated(navigation) { navigation.go("secret"); } export default () => <button onClick={() => navigation.go("next")}/>;',
		);
		expect(result.ok).toBe(true);
		expect(result.included).toEqual(["start", "next"]);
	});
	it("uses lexical constants across unrendered finite branches", async () => {
		const result = await check(
			'import { ui } from "spool"; const target = "secret"; export default function Frame() { const target = "next"; return <a data-go={ui.state.open ? target : "other"}/>; }',
		);
		expect(result.ok).toBe(true);
		expect(result.included).toEqual(["start", "next", "other"]);
	});
	it("keeps unknown props visible and accepts the frame-owned enforced declaration", async () => {
		const shared = { "shared/ui/nav.tsx": "export const Nav = ({ target }) => <a data-go={target}/>;" };
		const unknown = await check(
			'import { Nav } from "shared/ui/nav"; export default () => <Nav target={computed()}/>;',
			shared,
		);
		expect(unknown.diagnostics).toMatchObject([
			{ code: "navigation-unreadable", frame: "start", path: "shared/ui/nav.tsx" },
		]);
		const declared = await check(
			'import { Nav } from "shared/ui/nav"; export const links = { next: "next", other: "other" } as const; export default () => <Nav target={Object.values(links)[choice()]}/>;',
			shared,
		);
		expect(declared.ok).toBe(true);
		expect(declared.included).toEqual(["start", "next", "other"]);
	});
	it("terminates import cycles and follows direct re-exports", async () => {
		const result = await check('import { Nav } from "shared/nav"; export default () => <Nav/>;', {
			"shared/nav.ts": 'export { Nav } from "./ui/nav";',
			"shared/ui/nav.tsx":
				'import { helper } from "../helper"; export function Nav() { helper(); return <a data-go="next"/>; }',
			"shared/helper.ts": 'import { Nav } from "./nav"; export function helper() { return Nav; }',
		});
		expect(result.ok).toBe(true);
		expect(result.included).toEqual(["start", "next"]);
	});
	it("diagnoses unsupported Spool binding forms", async () => {
		const result = await check(
			'import { ui } from "spool"; const go = ui.go; export default () => <button onClick={() => go("next")}/>;',
		);
		expect(result.ok).toBe(false);
		expect(result.diagnostics[0]?.code).toBe("navigation-unreadable");
	});
	it("does not adopt another frame or unused component declaration", async () => {
		const result = await check(
			'import { helper } from "shared/helper"; export default () => <div>{helper()}</div>;',
			{
				"shared/helper.tsx":
					'export const links = { secret: "secret" } as const; export const helper = () => "text";',
			},
		);
		expect(result.ok).toBe(true);
		expect(result.included).toEqual(["start"]);
	});
	it("preserves known literals beside unresolved declared branches", async () => {
		const result = await check(
			'import { ui } from "spool"; export const links = { next: "next" } as const; export default () => <a data-go={ui.state.open ? "other" : compute(links)}/>;',
		);
		expect(result.diagnostics).toMatchObject([{ code: "links-disagree", frame: "start" }]);
	});
	it("rejects mutable and unsupported links declarations", async () => {
		for (const declaration of [
			'export const links = { next: "next" };',
			'const routes = { next: "next" } as const; export { routes as links };',
			"export function links() {}",
		]) {
			const result = await check(`${declaration} export default () => null;`);
			expect(result.diagnostics[0]?.code).toBe("invalid-links");
		}
	});
	it("does not infer a shadowed parameter from an outer constant", async () => {
		const result = await check(
			'const target = "next"; function Nav({target}) { return <a data-go={target}/>; } export default () => <Nav target={compute()}/>;',
		);
		expect(result.diagnostics[0]?.code).toBe("navigation-unreadable");
	});
	it("diagnoses namespace calls and spread attributes", async () => {
		for (const source of [
			'import * as spool from "spool"; export default () => <button onClick={() => spool.ui.go("next")}/>;',
			"export default () => <a {...compute()}/>;",
		]) {
			const result = await check(source);
			expect(result.diagnostics[0]?.code).toBe("navigation-unreadable");
		}
	});
	it("ignores unused nested helpers while following used callbacks", async () => {
		const result = await check(
			'import { ui } from "spool"; export default function Frame() { function unused() { ui.go("secret"); } function used() { ui.go("next"); } return <button onClick={used}/>; }',
		);
		expect(result.ok).toBe(true);
		expect(result.included).toEqual(["start", "next"]);
	});
	it("reports connected parse failures and missing target repairs", async () => {
		const broken = await check('export default () => <a data-go="draft"/>;');
		expect(broken.diagnostics[0]).toMatchObject({
			code: "source-unreadable",
			frame: "draft",
			path: "frames/draft/frame.tsx",
		});
		const missing = await check('export default () => <a data-go="renamed"/>;');
		expect(missing.diagnostics[0]).toMatchObject({ code: "target-missing", frame: "start" });
		expect(missing.diagnostics[0]?.remedy).toContain("renamed");
	});
	it("does not claim mutable or spread object destinations are finite", async () => {
		for (const source of [
			'const routes = { next: "next" }; routes.next = compute(); export default () => <a data-go={routes.next}/>;',
			'const routes = { next: "next", ...compute() }; export default () => <a data-go={routes.next}/>;',
		]) {
			const result = await check(source);
			expect(result.diagnostics[0]?.code).toBe("navigation-unreadable");
		}
	});
	it("infers direct literal props and rejects their declaration disagreements", async () => {
		const shared = { "shared/ui/nav.tsx": "export const Nav = ({target}) => <a data-go={target}/>;" };
		const inferred = await check(
			'import { Nav } from "shared/ui/nav"; export default () => <><Nav target="next"/><Nav target="other"/></>;',
			shared,
		);
		expect(inferred.ok).toBe(true);
		expect(inferred.included).toEqual(["start", "next", "other"]);
		const declared = await check(
			'import { Nav } from "shared/ui/nav"; export const links = { next: "next" } as const; export default () => <Nav target="other"/>;',
			shared,
		);
		expect(declared.diagnostics).toMatchObject([{ code: "links-disagree", frame: "start" }]);
	});
	it("supports props object reads and keeps missing or complex forwarding unknown", async () => {
		const shared = { "shared/ui/nav.tsx": "export function Nav(props) { return <a data-go={props.target}/>; }" };
		const inferred = await check(
			'import { Nav } from "shared/ui/nav"; export default () => <Nav target="next"/>;',
			shared,
		);
		expect(inferred.ok).toBe(true);
		expect(inferred.included).toEqual(["start", "next"]);
		const missing = await check(
			'import { Nav } from "shared/ui/nav"; export default () => <><Nav target="next"/><Nav/></>;',
			shared,
		);
		expect(missing.diagnostics[0]?.code).toBe("navigation-unreadable");
	});
	it("leaves imported image and text validation to the compiler", async () => {
		const result = await check(
			'import image from "shared/assets/photo.jpg"; import copy from "shared/copy.txt"; export default () => <main><img src={image}/><p>{copy}</p><a data-go="next"/></main>;',
			{ "shared/assets/photo.jpg": "image bytes", "shared/copy.txt": "copy" },
		);
		expect(result.ok).toBe(true);
		expect(result.included).toEqual(["start", "next"]);
	});
});
