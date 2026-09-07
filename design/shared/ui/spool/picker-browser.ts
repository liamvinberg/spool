import { useCallback, useEffect, useRef, useState } from "react";
import { browseDirectory, type FsHit, type FsListing, type FsSearch, searchDirectories } from "./picker-fixture";
import { browseRows } from "./picker-browser-model";

/** Read-only navigation and selection. A pasted path is resolved before it can be confirmed. */
export function useFolderBrowser(initialPath: string) {
	const [listing, setListing] = useState<FsListing | null>(null);
	const [home, setHome] = useState<string | null>(null);
	const [query, setQuery] = useState("");
	const [at, setAt] = useState(-1);
	const [browsing, setBrowsing] = useState(true);
	const [notice, setNotice] = useState<string | null>(null);
	const [found, setFound] = useState<{ key: string; value: FsSearch } | null>(null);
	const [resolved, setResolved] = useState<{ key: string; value: FsListing | undefined } | null>(null);
	const revision = useRef(0);
	const input = useRef<HTMLInputElement>(null);
	const list = useRef<HTMLDivElement>(null);
	const browse = useCallback(async (path: string) => {
		const mine = ++revision.current;
		setBrowsing(true);
		setNotice(null);
		try {
			const next = await browseDirectory(path);
			if (mine !== revision.current) return;
			if (!next) {
				setNotice("Could not open this folder. Choose another folder or try again.");
				return;
			}
			setListing(next);
			setQuery("");
			setAt(-1);
		} catch {
			if (mine === revision.current) setNotice("Could not open this folder. Try again.");
		} finally {
			if (mine === revision.current) {
				setBrowsing(false);
				input.current?.focus();
			}
		}
	}, []);
	useEffect(() => {
		let active = true;
		const opening = ++revision.current;
		void (async () => {
			try {
				const first = await browseDirectory();
				if (!active) return;
				if (!first) {
					setNotice("Could not read your home folder.");
					setBrowsing(false);
					return;
				}
				setHome(first.path);
				if (opening !== revision.current) return;
				setListing(first);
				await browse(initialPath === "~" ? first.path : initialPath);
			} catch {
				if (active) {
					setNotice("Could not read folders. Try again.");
					setBrowsing(false);
				}
			}
		})();
		return () => {
			active = false;
			revision.current++;
		};
	}, [browse, initialPath]);
	const term = query.trim();
	const pathQuery = term.startsWith("/") || term === "~" || term.startsWith("~/") || /^[a-z]:[\\/]/i.test(term);
	const underHome =
		home !== null && listing !== null && (listing.path === home || listing.path.startsWith(`${home}/`));
	const searchKey = term && !pathQuery && underHome ? `${home}\0${term}` : null;
	useEffect(() => {
		if (!term || (!pathQuery && searchKey === null)) return;
		let active = true;
		setNotice(null);
		if (pathQuery) {
			void browseDirectory(term)
				.then((value) => {
					if (active) {
						setResolved({ key: term, value });
						if (!value) setNotice("No folder at this path.");
					}
				})
				.catch(() => {
					if (active) {
						setResolved({ key: term, value: undefined });
						setNotice("Could not read this path.");
					}
				});
		} else if (searchKey !== null && home !== null) {
			void searchDirectories(term, home)
				.then((value) => {
					if (active) {
						setFound({ key: searchKey, value: value ?? { hits: [], answered: 0, total: 0 } });
						if (!value) setNotice("Could not search folders. Try again.");
					}
				})
				.catch(() => {
					if (active) {
						setFound({ key: searchKey, value: { hits: [], answered: 0, total: 0 } });
						setNotice("Could not search folders. Try again.");
					}
				});
		}
		return () => {
			active = false;
		};
	}, [term, pathQuery, searchKey, home]);
	const answer = found?.key === searchKey ? found.value : undefined;
	const pathAnswer = resolved?.key === term ? resolved : null;
	const pending = browsing || (pathQuery ? pathAnswer === null : searchKey !== null && answer === undefined);
	const rows: readonly FsHit[] = pathQuery
		? pathAnswer?.value
			? [
					{
						path: pathAnswer.value.path,
						parent: pathAnswer.value.parent ?? pathAnswer.value.path,
						name: pathAnswer.value.path.split(/[\\/]/).filter(Boolean).at(-1) ?? pathAnswer.value.path,
						isProject: pathAnswer.value.isProject,
						matched: [],
					},
				]
			: []
		: searchKey !== null
			? (answer?.hits ?? [])
			: listing
				? browseRows(listing).filter((row) => row.name.toLowerCase().includes(term.toLowerCase()))
				: [];
	const target = pathQuery ? rows[0] : (rows[at] ?? (term === "" ? (listing ?? undefined) : undefined));
	useEffect(() => {
		list.current?.querySelector<HTMLElement>(`[data-at="${at}"]`)?.scrollIntoView({ block: "nearest" });
	}, [at]);
	return {
		listing,
		home,
		query,
		rows,
		at,
		target,
		pending,
		browsing,
		notice,
		input,
		list,
		browse,
		select: (index: number) => {
			setAt(index);
			input.current?.focus();
		},
		setQuery: (value: string) => {
			setQuery(value);
			setAt(value.trim() ? 0 : -1);
			setNotice(null);
		},
	};
}
