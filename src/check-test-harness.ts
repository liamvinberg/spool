import { checkDesign } from "./check";

export function messages(root: string): string[] {
	return checkDesign(root).map(
		(diagnostic) =>
			`${diagnostic.path}:${diagnostic.line}:${diagnostic.column} TS${diagnostic.code}: ${diagnostic.message}`,
	);
}
