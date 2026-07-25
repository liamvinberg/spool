/** Parse the stable boot/start tuple exposed by Linux procfs. */
export function parseLinuxProcessBirth(stat: string, bootId: string): string | undefined {
	const processNameEnd = stat.lastIndexOf(") ");
	if (processNameEnd < 0) return undefined;
	const fields = stat
		.slice(processNameEnd + 2)
		.trim()
		.split(/\s+/);
	const startedAt = fields[19];
	const boot = bootId.trim();
	if (startedAt === undefined || !/^\d+$/.test(startedAt) || boot === "") return undefined;
	return `linux:${boot}:${startedAt}`;
}

/** Parse one platform command's process-birth output under the fixed C/UTC environment. */
export function parsePlatformProcessBirth(platform: string, output: string): string | undefined {
	const birth = output.trim();
	if (birth === "") return undefined;
	if (platform === "win32" && !/^\d+$/.test(birth)) return undefined;
	return `${platform}:${birth}`;
}
