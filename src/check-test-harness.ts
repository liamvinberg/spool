import { checkDesign } from "./check";

export async function messages(root: string): Promise<string[]> {
	return (await checkDesign(root)).map(
		(diagnostic) =>
			`${diagnostic.path}:${diagnostic.line}:${diagnostic.column} TS${diagnostic.code}: ${diagnostic.message}`,
	);
}
