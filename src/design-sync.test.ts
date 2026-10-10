import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { drift, synced } from "./design-sync";
import { makeTempDir } from "./test-helpers";

function repo(files: Record<string, string>): string {
	const root = makeTempDir();
	for (const [path, text] of Object.entries({ "src/ui/theme.css": "", "src/ui/typography.css": "", ...files })) {
		mkdirSync(join(root, path, ".."), { recursive: true });
		writeFileSync(join(root, path), text);
	}
	return root;
}

it("carries the primitives to the canvas with every file they import, and nothing else", () => {
	const root = repo({
		"src/ui/primitives/actions.tsx": 'import { Kbd } from "./display";\nimport { cn } from "../cn";',
		"src/ui/primitives/actions.test.tsx": 'import { Button } from "./actions";',
		"src/ui/primitives/display.tsx": 'import { Mark } from "../icons";',
		"src/ui/icons.tsx": 'import { PATH } from "../brand";',
		"src/ui/cn.ts": "",
		"src/brand.ts": "",
		"src/ui/home.tsx": "",
	});
	expect([...synced(root).keys()].filter((path) => path.startsWith("design/shared/system/"))).toEqual([
		"design/shared/system/brand.ts",
		"design/shared/system/ui/cn.ts",
		"design/shared/system/ui/icons.tsx",
		"design/shared/system/ui/primitives/actions.tsx",
		"design/shared/system/ui/primitives/display.tsx",
	]);
});

it("names a canvas copy the code no longer makes as drift", () => {
	const root = repo({ "design/shared/system/ui/primitives/gone.tsx": "" });
	expect(drift(root)).toContain("design/shared/system/ui/primitives/gone.tsx");
});
