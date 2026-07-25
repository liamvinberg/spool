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

export class CheckSourceLimitError extends Error {
	readonly file: string;

	constructor(file: string) {
		super(checkSourceLimitMessage);
		this.file = file;
	}
}

export class CheckSourceBudget {
	readonly #files = new Map<string, number>();
	#totalBytes = 0;

	constructor(private readonly limits: CheckSourceLimits = checkSourceLimits) {}

	get maxFileBytes(): number {
		return this.limits.maxFileBytes;
	}

	reserve(file: string, bytes: number): void {
		const previousBytes = this.#files.get(file);
		const nextTotalBytes = this.#totalBytes - (previousBytes ?? 0) + bytes;
		if (
			bytes > this.limits.maxFileBytes ||
			nextTotalBytes > this.limits.maxTotalBytes ||
			(previousBytes === undefined && this.#files.size + 1 > this.limits.maxFiles)
		) {
			throw new CheckSourceLimitError(file);
		}
		this.#files.set(file, bytes);
		this.#totalBytes = nextTotalBytes;
	}
}
