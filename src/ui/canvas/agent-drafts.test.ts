import { IDBDatabase, IDBFactory } from "fake-indexeddb";
import { describe, expect, it, vi } from "vitest";
import { AgentDrafts, type ComposerDraft } from "./agent-drafts";

const first: ComposerDraft = {
	id: "one",
	engine: "claude",
	at: 10,
	text: "half a sentence",
	attached: [
		{ media: "image/png", data: "AAAA" },
		{ media: "image/jpeg", data: "BBBB" },
	],
};

function memoryStorage(): Storage {
	const values = new Map<string, string>();
	return {
		get length() {
			return values.size;
		},
		key: (index) => [...values.keys()][index] ?? null,
		getItem: (key) => values.get(key) ?? null,
		setItem: (key, value) => {
			values.set(key, value);
		},
		removeItem: (key) => {
			values.delete(key);
		},
		clear: () => values.clear(),
	};
}

describe("composer storage", () => {
	it("recovers the last words and cleared images when unload cancels the database write", async () => {
		const database = new IDBFactory();
		const storage = memoryStorage();
		const book = new AgentDrafts("first", database, storage);
		book.put(first);
		await book.flush();
		book.put({ ...first, text: "last keystroke", attached: [] });
		const fail = vi.spyOn(IDBDatabase.prototype, "transaction").mockImplementationOnce(() => {
			throw new Error("page is leaving");
		});
		await book.flush();
		fail.mockRestore();
		const restored = new AgentDrafts("first", database, storage);
		await restored.ready;
		expect(restored.entries.get(first.id)).toMatchObject({ text: "last keystroke", attached: [] });
		expect(storage.getItem("spool.agent-drafts.first.one")).not.toContain("AAAA");
	});

	it("keeps both conversations when separate views save different drafts", async () => {
		const database = new IDBFactory();
		const one = new AgentDrafts("first", database);
		const two = new AgentDrafts("first", database);
		await Promise.all([one.ready, two.ready]);
		one.put(first);
		two.put({ ...first, id: "two", text: "another conversation" });
		await Promise.all([one.flush(), two.flush()]);
		const restored = new AgentDrafts("first", database);
		await restored.ready;
		expect([...restored.entries.keys()]).toEqual(["one", "two"]);
	});

	it("queues the last edit even while an earlier save is still running", async () => {
		const database = new IDBFactory();
		const book = new AgentDrafts("first", database);
		await book.ready;
		book.put(first);
		const earlier = book.flush();
		book.put({ ...first, text: "last keystroke" });
		const latest = book.flush();
		await Promise.all([earlier, latest]);
		const restored = new AgentDrafts("first", database);
		await restored.ready;
		expect(restored.entries.get(first.id)?.text).toBe("last keystroke");
	});

	it("restores the selected conversation, its text and every image in the right project", async () => {
		const database = new IDBFactory();
		const book = new AgentDrafts("first", database);
		book.put(first);
		book.select(first.id);
		await book.flush();
		const restored = new AgentDrafts("first", database);
		const other = new AgentDrafts("other", database);
		await Promise.all([restored.ready, other.ready]);
		expect(restored.entries.get(first.id)).toEqual(first);
		expect(restored.open).toBe(first.id);
		expect(other.entries.size).toBe(0);
	});

	it("keeps edits made while storage is loading", async () => {
		const database = new IDBFactory();
		const book = new AgentDrafts("first", database);
		book.put(first);
		await book.flush();
		const next = new AgentDrafts("first", database);
		next.put({ ...first, text: "newer words" });
		await next.ready;
		expect(next.entries.get(first.id)?.text).toBe("newer words");
	});

	it("keeps an empty draft after sending and removes a closed conversation", async () => {
		const database = new IDBFactory();
		const book = new AgentDrafts("first", database);
		book.put(first);
		await book.flush();
		book.put({ ...first, text: "", attached: [] });
		await book.flush();
		const cleared = new AgentDrafts("first", database);
		await cleared.ready;
		expect(cleared.entries.get(first.id)).toMatchObject({ text: "", attached: [] });
		book.forget(first.id);
		await book.flush();
		const closed = new AgentDrafts("first", database);
		await closed.ready;
		expect(closed.entries.size).toBe(0);
	});

	it("does no storage work in the typing call and never waits for unavailable storage", async () => {
		const database = new IDBFactory();
		const book = new AgentDrafts("first", database);
		await book.ready;
		const spy = vi.spyOn(IDBDatabase.prototype, "transaction");
		book.put(first);
		expect(book.entries.get(first.id)?.text).toBe(first.text);
		expect(spy).not.toHaveBeenCalled();
		spy.mockRestore();
		await book.flush();
		const refused = new AgentDrafts("first", undefined);
		refused.put(first);
		await refused.flush();
		expect(refused.entries.get(first.id)).toEqual(first);
	});
});
