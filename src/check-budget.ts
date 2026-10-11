export interface CheckSourceLimits {
	maxFileBytes: number;
	maxTotalBytes: number;
	maxFiles: number;
	maxAliases: number;
}

export const checkSourceLimits: CheckSourceLimits = {
	maxFileBytes: 2 * 1024 * 1024,
	maxTotalBytes: 16 * 1024 * 1024,
	maxFiles: 512,
	maxAliases: 6 * 1024,
};

export const checkSourceLimitMessage = "Offline check resource limit exceeded";

/** Which limit a check ran into: one file's size, all sources' size, how many there are, or checker aliases. */
export type CheckSourceLimit = "file-bytes" | "total-bytes" | "files" | "aliases";

export class CheckSourceLimitError extends Error {
	readonly file: string;
	readonly limit: CheckSourceLimit;

	constructor(file: string, limit: CheckSourceLimit) {
		super(checkSourceLimitMessage);
		this.file = file;
		this.limit = limit;
	}
}

export class CheckSourceBudget {
	readonly #files = new Map<string, number>();
	#totalBytes = 0;

	constructor(private readonly limits: CheckSourceLimits = checkSourceLimits) {}

	/** How many sources it holds and their bytes, for saying how far over a limit a check is. */
	get usage(): { files: number; bytes: number } {
		return { files: this.#files.size, bytes: this.#totalBytes };
	}

	get maxFileBytes(): number {
		return this.limits.maxFileBytes;
	}

	reserve(file: string, bytes: number): void {
		const previousBytes = this.#files.get(file);
		const nextTotalBytes = this.#totalBytes - (previousBytes ?? 0) + bytes;
		if (bytes > this.limits.maxFileBytes) throw new CheckSourceLimitError(file, "file-bytes");
		if (nextTotalBytes > this.limits.maxTotalBytes) throw new CheckSourceLimitError(file, "total-bytes");
		if (previousBytes === undefined && this.#files.size + 1 > this.limits.maxFiles) {
			throw new CheckSourceLimitError(file, "files");
		}
		this.#files.set(file, bytes);
		this.#totalBytes = nextTotalBytes;
	}
}
