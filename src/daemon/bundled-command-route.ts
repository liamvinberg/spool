/** This grammar grants no shell syntax, glob, substitution, executable path or extra flag. */
export function trustedCommand(command: string): string[] | undefined {
	if (!/^[a-zA-Z0-9_./ -]+$/.test(command)) return;
	const [binary, verb, ...args] = command.trim().split(/ +/);
	if (binary !== "spool" || !verb) return;
	const name = (value: string | undefined) => value !== undefined && /^[a-zA-Z0-9_][a-zA-Z0-9_-]*$/.test(value);
	if (verb === "check") return args.length <= 1 && !args[0]?.startsWith("-") ? [verb, ...args] : undefined;
	if (["selection", "flows", "status"].includes(verb)) return args.length === 0 ? [verb] : undefined;
	if (verb === "skill")
		return args.length === 0 ||
			(args.length === 1 && ["frames", "flows", "scenarios", "styling", "shaders", "verbs"].includes(args[0] ?? ""))
			? [verb, ...args]
			: undefined;
	if (!["shot", "logs", "url"].includes(verb) || !name(args[0])) return;
	const flags = new Set<string>();
	for (let index = 1; index < args.length; index++) {
		const flag = args[index] ?? "";
		if (flags.has(flag)) return;
		flags.add(flag);
		if (verb === "url" && flag === "--raw") continue;
		const value = args[++index];
		if ((verb === "shot" || verb === "logs") && flag === "--scenario" && name(value)) continue;
		if (verb === "shot" && flag === "--at" && /^\d+$/.test(value ?? "") && Number(value) <= 60_000) continue;
		if (verb === "shot" && flag === "--viewport" && /^[1-9]\d{0,4}x[1-9]\d{0,4}$/.test(value ?? "")) continue;
		return;
	}
	return [verb, ...args];
}

export const SPOOL_COMMAND_GUIDANCE =
	"Use one Spool command per tool call: spool skill, check, shot, logs, url, selection, flows or status, with supported arguments. Bare spool invocations in shell programs are refused. Use spool url to inspect a frame in the player.";
