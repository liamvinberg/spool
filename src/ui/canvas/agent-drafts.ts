import { type Attachment, parseAttachments } from "../../attachment";
import { type AgentEngineId, isAgentEngineId } from "../../daemon/agent-engine";

export interface ComposerDraft {
	readonly id: string;
	readonly engine: AgentEngineId;
	readonly at: number;
	readonly text: string;
	readonly attached: readonly Attachment[];
}

type DraftWords = Omit<ComposerDraft, "attached">;
type Recovery = DraftWords & { readonly images: boolean };

/** Browser-owned unsent work. Text writes never clone the image bytes again. */
export class AgentDrafts {
	readonly ready: Promise<void>;
	readonly entries = new Map<string, ComposerDraft>();
	open = "";
	private database: IDBDatabase | null = null;
	private touched = new Set<string>();
	private dirty = new Set<string>();
	private images = new Map<string, readonly Attachment[]>();
	private moved = false;
	private timer: ReturnType<typeof setTimeout> | undefined;
	private recovered = new Map<string, Recovery | null>();
	private readonly prefix: string;

	constructor(
		private readonly project: string,
		factory: IDBFactory | undefined,
		private readonly storage?: Storage,
	) {
		this.prefix = `spool.agent-drafts.${encodeURIComponent(project)}.`;
		this.recover();
		this.ready = this.restore(factory).catch(() => {});
	}

	private recover(): void {
		try {
			if (!this.storage) return;
			for (let index = 0; index < this.storage.length; index++) {
				const key = this.storage.key(index);
				if (!key?.startsWith(this.prefix)) continue;
				const id = key.slice(this.prefix.length);
				const raw = this.storage.getItem(key);
				if (id === "open") {
					this.open = raw ?? "";
					this.moved = true;
					continue;
				}
				let value: unknown;
				try {
					value = JSON.parse(raw ?? "null");
				} catch {
					continue;
				}
				if (value === null) this.recovered.set(id, null);
				else if (isWords(value) && value.id === id && "images" in value && typeof value.images === "boolean") {
					const words = {
						id: value.id,
						engine: value.engine,
						at: value.at,
						text: value.text,
						images: value.images,
					};
					this.recovered.set(id, words);
					this.entries.set(id, { id, engine: words.engine, at: words.at, text: words.text, attached: [] });
				}
			}
		} catch {
			/* A refused store still leaves the live draft editable. */
		}
	}

	private checkpoint(): void {
		try {
			if (!this.storage) return;
			this.storage.setItem(`${this.prefix}open`, this.open);
			for (const id of this.dirty) {
				const draft = this.entries.get(id);
				const record = draft
					? { id, engine: draft.engine, at: draft.at, text: draft.text, images: draft.attached.length > 0 }
					: null;
				this.storage.setItem(this.prefix + id, JSON.stringify(record));
			}
		} catch {
			/* A full quota cannot refuse typing or an IndexedDB save. */
		}
	}

	private async restore(factory: IDBFactory | undefined): Promise<void> {
		if (!factory) return;
		const database = await new Promise<IDBDatabase>((resolve, reject) => {
			const request = factory.open("spool.agent-drafts", 1);
			request.onupgradeneeded = () => {
				request.result.createObjectStore("projects");
				request.result.createObjectStore("images");
				request.result
					.createObjectStore("drafts", { keyPath: ["project", "id"] })
					.createIndex("project", "project");
			};
			request.onsuccess = () => resolve(request.result);
			request.onerror = () => reject(request.error);
			request.onblocked = () => reject(new Error("Draft storage is blocked"));
		});
		this.database = database;
		database.onversionchange = () => {
			database.close();
			this.database = null;
		};
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction(["projects", "drafts", "images"], "readonly");
			const selected = transaction.objectStore("projects").get(this.project);
			selected.onsuccess = () => {
				if (!this.moved && typeof selected.result === "string") this.open = selected.result;
			};
			const request = transaction.objectStore("drafts").index("project").getAll(this.project);
			request.onsuccess = () => {
				for (const value of request.result) {
					if (!isWords(value)) continue;
					const recovered = this.recovered.get(value.id);
					if (recovered === null) continue;
					const image = transaction.objectStore("images").get([this.project, value.id]);
					image.onsuccess = () => {
						if (this.touched.has(value.id)) return;
						const attached = recovered?.images === false ? [] : (parseAttachments(image.result) ?? []);
						const words = recovered ?? value;
						this.entries.set(value.id, {
							id: value.id,
							engine: words.engine,
							at: words.at,
							text: words.text,
							attached,
						});
						this.images.set(value.id, attached);
					};
				}
			};
			transaction.oncomplete = () => resolve();
			transaction.onabort = () => reject(transaction.error);
		});
	}

	select(id: string): void {
		this.open = id;
		this.moved = true;
		this.schedule();
	}

	put(draft: ComposerDraft): void {
		this.entries.set(draft.id, draft);
		this.touched.add(draft.id);
		this.dirty.add(draft.id);
		this.schedule();
	}

	forget(id: string): void {
		this.entries.delete(id);
		this.touched.add(id);
		this.dirty.add(id);
		this.schedule();
	}

	private schedule(): void {
		// A bounded interval also saves during uninterrupted typing.
		this.timer ??= setTimeout(() => void this.flush(), 250);
	}

	flush(): Promise<void> {
		clearTimeout(this.timer);
		this.timer = undefined;
		// Only words enter synchronous storage. Unload can cancel async transactions.
		this.checkpoint();
		// Queue the transaction now when leaving the page. Waiting on a previous
		// write's promise would leave the last edit in JavaScript that may never run.
		return (this.database ? this.write() : this.ready.then(() => this.write())).catch(() => {
			// Refused/full storage must never refuse typing. Keep the dirty memory copy.
		});
	}

	private async write(): Promise<void> {
		const database = this.database;
		if (!database) return;
		const dirty = new Map([...this.dirty].map((id) => [id, this.entries.get(id)]));
		await new Promise<void>((resolve, reject) => {
			const transaction = database.transaction(["projects", "drafts", "images"], "readwrite");
			transaction.objectStore("projects").put(this.open, this.project);
			for (const [id, draft] of dirty) {
				const words = transaction.objectStore("drafts");
				if (!draft) words.delete([this.project, id]);
				else {
					const { attached: _, ...record } = draft;
					words.put({ ...record, project: this.project });
				}
				const store = transaction.objectStore("images");
				if (!draft || draft.attached.length === 0) store.delete([this.project, id]);
				else if (this.images.get(id) !== draft.attached) store.put(draft.attached, [this.project, id]);
			}
			transaction.oncomplete = () => resolve();
			transaction.onabort = () => reject(transaction.error);
		});
		for (const [id, draft] of dirty) {
			if (this.entries.get(id) !== draft) continue;
			this.dirty.delete(id);
			if (draft) this.images.set(id, draft.attached);
			else this.images.delete(id);
		}
	}
}

function isWords(value: unknown): value is DraftWords {
	if (!value || typeof value !== "object") return false;
	return (
		"id" in value &&
		typeof value.id === "string" &&
		"engine" in value &&
		isAgentEngineId(value.engine) &&
		"at" in value &&
		typeof value.at === "number" &&
		Number.isFinite(value.at) &&
		"text" in value &&
		typeof value.text === "string"
	);
}

// The memory copy outlives a project view, including a write still waiting on IndexedDB.
const books = new WeakMap<IDBFactory, Map<string, AgentDrafts>>();
export function draftsFor(project: string): AgentDrafts {
	let factory: IDBFactory | undefined;
	let storage: Storage | undefined;
	try {
		factory = window.indexedDB;
	} catch {
		/* Storage can be refused on access. */
	}
	try {
		storage = window.localStorage;
	} catch {
		/* Storage may be refused independently. */
	}
	if (!factory) return new AgentDrafts(project, undefined, storage);
	let projects = books.get(factory);
	if (!projects) {
		projects = new Map();
		books.set(factory, projects);
	}
	let drafts = projects.get(project);
	if (!drafts) {
		drafts = new AgentDrafts(project, factory, storage);
		projects.set(project, drafts);
	}
	return drafts;
}
