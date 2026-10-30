import { afterAll, beforeAll } from "vitest";
import { checkDesign, shareChecker } from "./check";

let sharedInFile = false;

/** Run the calling test file's checks on one TypeScript process; importing this module already does. */
export function shareCheckerInFile(): void {
	if (sharedInFile) return;
	sharedInFile = true;
	let close: (() => Promise<void>) | undefined;
	beforeAll(() => {
		close = shareChecker();
	});
	afterAll(async () => {
		await close?.();
	});
}

shareCheckerInFile();

export async function messages(root: string): Promise<string[]> {
	return (await checkDesign(root)).map(
		(diagnostic) =>
			`${diagnostic.path}:${diagnostic.line}:${diagnostic.column} TS${diagnostic.code}: ${diagnostic.message}`,
	);
}
