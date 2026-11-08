/** The tools spool reads, by the name a person knows them by. */
export type ImportSource = "Figma";

/**
 * Which tool a file is from, by its name: the one fact both sides need, the window to take a drop and the daemon
 * to pick an adapter, kept free of everything else so the window can read it (spool#242).
 */
export function importSourceOf(fileName: string): ImportSource | undefined {
	return /\.fig$/iu.test(fileName) ? "Figma" : undefined;
}
