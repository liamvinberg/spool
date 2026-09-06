import { randomUUID } from "node:crypto";
import {
	chmodSync,
	closeSync,
	existsSync,
	fsyncSync,
	mkdirSync,
	openSync,
	readFileSync,
	renameSync,
	rmSync,
	writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import type { AuthOperationOptions, Credential, CredentialStore } from "@earendil-works/pi-ai";
import { z } from "zod";

export function privateDirectory(path: string): void {
	mkdirSync(path, { recursive: true, mode: 0o700 });
	chmodSync(path, 0o700);
}

/** A failed rename leaves the previous complete value readable and reports failure. */
export function writePrivate(path: string, content: string): void {
	privateDirectory(dirname(path));
	const temporary = `${path}.${randomUUID()}.tmp`;
	try {
		const fd = openSync(temporary, "wx", 0o600);
		try {
			writeFileSync(fd, content);
			fsyncSync(fd);
		} finally {
			closeSync(fd);
		}
		renameSync(temporary, path);
	} finally {
		rmSync(temporary, { force: true });
	}
}

const credential = z.discriminatedUnion("type", [
	z.object({ type: z.literal("api_key"), key: z.string() }),
	z.object({ type: z.literal("oauth"), refresh: z.string(), access: z.string(), expires: z.number() }).passthrough(),
]);
const credentials = z.record(z.string(), credential);

/** One instance in the supervised host; every write, refresh and logout shares its queue. */
export class BundledCredentialStore implements CredentialStore {
	private readonly path: string;
	private held: Record<string, Credential>;
	private pending: Promise<unknown> = Promise.resolve();
	private readonly generations = new Map<string, number>();
	invalidate(provider: string): void {
		this.generations.set(provider, (this.generations.get(provider) ?? 0) + 1);
	}
	constructor(
		directory: string,
		private readonly persist = writePrivate,
	) {
		privateDirectory(directory);
		this.path = join(directory, "credentials.json");
		this.held = existsSync(this.path) ? credentials.parse(JSON.parse(readFileSync(this.path, "utf8"))) : {};
		if (existsSync(this.path)) chmodSync(this.path, 0o600);
	}
	async read(provider: string, options?: AuthOperationOptions): Promise<Credential | undefined> {
		options?.signal?.throwIfAborted();
		await this.pending;
		return structuredClone(this.held[provider]);
	}
	async list(options?: AuthOperationOptions) {
		options?.signal?.throwIfAborted();
		await this.pending;
		return Object.entries(this.held).map(([providerId, value]) => ({ providerId, type: value.type }));
	}
	private serialize<T>(operation: () => Promise<T>): Promise<T> {
		const next = this.pending.then(operation);
		this.pending = next.catch(() => undefined);
		return next;
	}
	modify(
		provider: string,
		fn: (current: Credential | undefined) => Promise<Credential | undefined>,
		options?: AuthOperationOptions,
	): Promise<Credential | undefined> {
		const generation = this.generations.get(provider);
		const current = () => {
			if (generation !== this.generations.get(provider)) throw new Error("Connection changed during authorization");
		};
		return this.serialize(async () => {
			options?.signal?.throwIfAborted();
			current();
			const next = await fn(structuredClone(this.held[provider]));
			current();
			options?.signal?.throwIfAborted();
			if (next === undefined) return structuredClone(this.held[provider]);
			const updated = { ...this.held, [provider]: structuredClone(next) };
			this.persist(this.path, JSON.stringify(updated));
			this.held = updated;
			return structuredClone(next);
		});
	}
	delete(provider: string, options?: AuthOperationOptions): Promise<void> {
		this.invalidate(provider);
		return this.serialize(async () => {
			options?.signal?.throwIfAborted();
			const updated = { ...this.held };
			delete updated[provider];
			this.persist(this.path, JSON.stringify(updated));
			this.held = updated;
		});
	}
}
