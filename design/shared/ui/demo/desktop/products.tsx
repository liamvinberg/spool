import { useState } from "react";
import coast from "shared/assets/desktop/coast.jpg";
import { cn } from "shared/lib/utils";
import { PlayIcon, SearchIcon, BackIcon, CheckIcon } from "shared/ui/spool/icons";
import "./products.css";

export type DesktopTake = "music" | "records" | "library" | "cinema";
export type DesktopScreen = "home" | "detail";
const TRACKS = [
	{ name: "A little longer", artist: "Mira Sol", time: "4:12", cover: 0 },
	{ name: "Blue hours", artist: "Pacific Hotel", time: "3:48", cover: 1 },
	{ name: "Nothing in particular", artist: "Form & Field", time: "5:06", cover: 2 },
	{ name: "In the middle of June", artist: "Sunday Service", time: "3:22", cover: 3 },
	{ name: "Room with a view", artist: "Mira Sol", time: "4:31", cover: 0 },
] as const;
const ALBUMS = ["Soft focus", "Blue hours", "Every other day", "Sun room"];

export function Cover({ index = 0 }: { index?: number }) {
	return (
		<div
			className={cn("dd-cover", `dd-cover-${index % 4}`)}
			aria-label={`${ALBUMS[index % 4]} album artwork`}
			role="img"
		>
			{index % 4 === 0 ? (
				<>
					<span>
						soft
						<br />
						focus
					</span>
					<i />
					<small>MIRA SOL</small>
				</>
			) : index % 4 === 1 ? (
				<>
					<i />
					<span>
						BLUE
						<br />
						HOURS
					</span>
					<small>PACIFIC HOTEL</small>
				</>
			) : index % 4 === 2 ? (
				<>
					<span>
						every
						<br />
						other
						<br />
						day.
					</span>
					<i />
					<small>FORM & FIELD</small>
				</>
			) : (
				<>
					<i />
					<span>
						sun
						<br />
						room
					</span>
					<small>SUNDAY SERVICE</small>
				</>
			)}
		</div>
	);
}

function Music({ light, initial, headline }: { light: boolean; initial: DesktopScreen; headline: string }) {
	const [page, setPage] = useState<"home" | "detail" | "saved">(initial);
	const [album, setAlbum] = useState(0);
	const [track, setTrack] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [liked, setLiked] = useState(false);
	const [search, setSearch] = useState("");
	const [position, setPosition] = useState(32);
	const current = TRACKS[track] ?? TRACKS[0];
	const openAlbum = (index: number) => {
		setAlbum(index);
		setPage("detail");
	};
	return (
		<div className={cn("dd dd-music", light && "dd-records")}>
			<aside className="dd-music-sidebar">
				<button className="dd-music-logo" type="button" onClick={() => setPage("home")}>
					<span>◕</span> {light ? "sleeve" : "sunda"}
				</button>
				<nav aria-label="Music">
					<button type="button" aria-current={page === "home" ? "page" : undefined} onClick={() => setPage("home")}>
						◈ <span>Listen now</span>
					</button>
					<button type="button" aria-current={page === "saved" ? "page" : undefined} onClick={() => setPage("saved")}>
						♡ <span>Your collection</span>
					</button>
				</nav>
				<div className="dd-sidebar-rule" />
				<p>Made for you</p>
				{["Slow mornings", "After hours", "On repeat"].map((title, i) => (
					<button type="button" className="dd-playlist" onClick={() => openAlbum(i)} key={title}>
						<Cover index={i} />
						<span>
							{title}
							<small>{i + 12} tracks</small>
						</span>
					</button>
				))}
				<div className="dd-sidebar-bottom">
					<span className="dd-avatar">J</span> Jamie's space <span>⌄</span>
				</div>
			</aside>
			<main className="dd-music-main">
				<header className="dd-music-top">
					<button
						type="button"
						aria-label="Back to listening"
						onClick={() => {
							setPage("home");
							setSearch("");
						}}
					>
						<BackIcon />
					</button>
					<label>
						<SearchIcon />
						<input
							aria-label="Search music"
							placeholder="Find your next favourite"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
						/>
					</label>
					<span>Good afternoon, Jamie.</span>
				</header>
				{search ? (
					<div className="dd-search-results">
						<h1>Search</h1>
						{TRACKS.filter((item) => `${item.name} ${item.artist}`.toLowerCase().includes(search.toLowerCase())).map(
							(item) => (
								<button
									type="button"
									key={item.name}
									onClick={() => {
										setTrack(TRACKS.indexOf(item));
										setPlaying(true);
									}}
								>
									<Cover index={item.cover} />
									<span>
										{item.name}
										<small>{item.artist}</small>
									</span>
									<PlayIcon />
								</button>
							),
						)}
						{!TRACKS.some((item) => `${item.name} ${item.artist}`.toLowerCase().includes(search.toLowerCase())) && (
							<p>No tracks found. Try “Mira”.</p>
						)}
					</div>
				) : page === "home" ? (
					<>
						{light ? (
							<div className="dd-record-feature">
								<div>
									<h1>{headline}</h1>
									<p>Records for a slower kind of day.</p>
									<button type="button" onClick={() => openAlbum(0)}>
										Find your next record <span>↗</span>
									</button>
								</div>
								<button
									type="button"
									className="dd-record-art"
									aria-label="Open Soft focus"
									onClick={() => openAlbum(0)}
								>
									<Cover />
									<div className="dd-vinyl" />
								</button>
							</div>
						) : (
							<div className="dd-music-feature">
								<div>
									<h1>{headline}</h1>
									<p>
										A little soul. A little space.
										<br />
										Something good to get lost in.
									</p>
									<button
										type="button"
										onClick={() => {
											setPlaying(!playing);
											setTrack(0);
										}}
									>
										<PlayIcon />
										{playing ? "Pause the mix" : "Play the mix"}
									</button>
								</div>
								<button
									type="button"
									className="dd-feature-art"
									aria-label="Open Soft focus"
									onClick={() => openAlbum(0)}
								>
									<Cover />
								</button>
								<span className="dd-feature-duration">12 songs · 48 minutes</span>
							</div>
						)}
						<div className="dd-section-heading">
							<h2>{light ? "On the shelf" : "A few things you'll love"}</h2>
							<button type="button" onClick={() => setPage("saved")}>
								Your collection ↗
							</button>
						</div>
						<div className="dd-albums">
							{ALBUMS.map((title, i) => (
								<button type="button" key={title} onClick={() => openAlbum(i)}>
									<Cover index={i} />
									<strong>{title}</strong>
									<span>{TRACKS[i]?.artist}</span>
								</button>
							))}
						</div>
					</>
				) : page === "saved" ? (
					<div className="dd-collection">
						<h1>Your collection.</h1>
						<p>A small shelf of good things.</p>
						<div className="dd-albums">
							{ALBUMS.filter((_, i) => i < 2 || liked).map((title, i) => (
								<button type="button" key={title} onClick={() => openAlbum(i)}>
									<Cover index={i} />
									<strong>{title}</strong>
									<span>Saved album</span>
								</button>
							))}
						</div>
					</div>
				) : (
					<>
						<div className="dd-album-detail">
							<Cover index={album} />
							<div>
								<span>{TRACKS[album]?.artist}</span>
								<h1>{ALBUMS[album]}</h1>
								<p>2026 · 5 tracks · 21 min</p>
								<div>
									<button className="dd-album-play" type="button" onClick={() => setPlaying(!playing)}>
										<PlayIcon />
										{playing ? "Pause album" : "Play album"}
									</button>
									<button
										type="button"
										className="dd-like"
										aria-label={liked ? "Unsave album" : "Save album"}
										aria-pressed={liked}
										onClick={() => setLiked(!liked)}
									>
										{liked ? "♥" : "♡"}
									</button>
								</div>
							</div>
						</div>
						<div className="dd-tracks">
							<div className="dd-track-head">
								<span>#</span>
								<span>Title</span>
								<span>Artist</span>
								<span>Time</span>
							</div>
							{TRACKS.map((item, i) => (
								<button
									type="button"
									key={item.name}
									data-playing={playing && track === i}
									onClick={() => {
										setTrack(i);
										setPlaying(true);
									}}
								>
									<span>{playing && track === i ? "Ⅱ" : `0${i + 1}`}</span>
									<strong>{item.name}</strong>
									<span>{item.artist}</span>
									<span>{item.time}</span>
								</button>
							))}
						</div>
					</>
				)}
			</main>
			<footer className="dd-player">
				<div className="dd-current">
					<Cover index={current.cover} />
					<span>
						{current.name}
						<small>{current.artist}</small>
					</span>
					<button
						type="button"
						aria-label={liked ? "Unlike track" : "Like track"}
						aria-pressed={liked}
						onClick={() => setLiked(!liked)}
					>
						{liked ? "♥" : "♡"}
					</button>
				</div>
				<div className="dd-play-controls">
					<div>
						<button
							type="button"
							aria-label="Previous track"
							onClick={() => setTrack((track + TRACKS.length - 1) % TRACKS.length)}
						>
							Ⅰ‹
						</button>
						<button
							className="dd-play-pause"
							type="button"
							aria-label={playing ? "Pause track" : "Play track"}
							onClick={() => setPlaying(!playing)}
						>
							{playing ? "Ⅱ" : <PlayIcon />}
						</button>
						<button
							type="button"
							aria-label="Next track"
							onClick={() => {
								setTrack((track + 1) % TRACKS.length);
								setPosition(0);
							}}
						>
							›Ⅰ
						</button>
					</div>
					<label>
						<span>
							{Math.floor((position * 2.52) / 60)}:{String(Math.floor(position * 2.52) % 60).padStart(2, "0")}
						</span>
						<input
							type="range"
							aria-label="Track position"
							value={position}
							onChange={(event) => setPosition(Number(event.target.value))}
						/>
						<span>{current.time}</span>
					</label>
				</div>
				<span className="dd-silent">Interactive preview · audio off</span>
			</footer>
		</div>
	);
}

const ITEMS = [
	{ title: "The quiet coast", type: "Photography", art: "photo" },
	{ title: "Soft focus", type: "Typography", art: "type" },
	{ title: "A study in circles", type: "Objects", art: "circle" },
	{ title: "Every other day", type: "Typography", art: "poster" },
	{ title: "Atlantic blue", type: "Photography", art: "sea" },
	{ title: "Colour, collected", type: "Objects", art: "swatch" },
];

function Library({ initial, headline }: { initial: DesktopScreen; headline: string }) {
	const [filter, setFilter] = useState("All");
	const [search, setSearch] = useState("");
	const [opened, setOpened] = useState<number | null>(initial === "detail" ? 0 : null);
	const [saved, setSaved] = useState<readonly number[]>([]);
	const [savedOnly, setSavedOnly] = useState(false);
	return (
		<div className="dd dd-library">
			<aside className="dd-library-sidebar">
				<button
					type="button"
					className="dd-index-logo"
					onClick={() => {
						setOpened(null);
						setSavedOnly(false);
					}}
				>
					index<span>✳</span>
				</button>
				<button
					type="button"
					className={!savedOnly ? "is-active" : ""}
					onClick={() => {
						setSavedOnly(false);
						setOpened(null);
					}}
				>
					All references <span>6</span>
				</button>
				<button
					type="button"
					className={savedOnly ? "is-active" : ""}
					onClick={() => {
						setSavedOnly(true);
						setOpened(null);
					}}
				>
					Saved <span>{saved.length}</span>
				</button>
				<div className="dd-sidebar-rule" />
				<p>Collections</p>
				{["A slower pace", "Type that talks", "Colours & shapes"].map((name, i) => (
					<button
						type="button"
						key={name}
						onClick={() => {
							setFilter(i === 0 ? "Photography" : i === 1 ? "Typography" : "Objects");
							setSavedOnly(false);
							setOpened(null);
						}}
					>
						<i className={`dd-collection-dot dd-dot-${i}`} />
						{name}
					</button>
				))}
				<div className="dd-index-bottom">
					A place for your
					<br />
					good references.
				</div>
			</aside>
			<main>
				<header className="dd-library-top">
					<span>Your workspace / References</span>
					<label>
						<SearchIcon />
						<input
							value={search}
							placeholder="Search your library"
							aria-label="Search references"
							onChange={(event) => {
								setSearch(event.target.value);
								setOpened(null);
							}}
						/>
					</label>
					<span className="dd-avatar">J</span>
				</header>
				{opened !== null ? (
					<div className="dd-reference-detail">
						<button type="button" onClick={() => setOpened(null)}>
							← All references
						</button>
						<div>
							<ReferenceArt kind={ITEMS[opened]?.art ?? "photo"} />
							<aside>
								<span>{ITEMS[opened]?.type}</span>
								<h1>{ITEMS[opened]?.title}</h1>
								<p>Space, texture, and the feeling of having nowhere else to be.</p>
								<button
									type="button"
									onClick={() =>
										setSaved((old) => (old.includes(opened) ? old.filter((id) => id !== opened) : [...old, opened]))
									}
								>
									{saved.includes(opened) ? <CheckIcon /> : "+"}
									{saved.includes(opened) ? "Saved to your library" : "Save reference"}
								</button>
								<dl>
									<dt>Collection</dt>
									<dd>A slower pace</dd>
									<dt>Added by</dt>
									<dd>Jamie</dd>
									<dt>Source</dt>
									<dd>Original concept artwork</dd>
								</dl>
							</aside>
						</div>
					</div>
				) : (
					<>
						<div className="dd-library-title">
							<h1>{savedOnly ? "Your saved references." : headline}</h1>
							<p>{savedOnly ? "The ones you want to come back to." : "A home for everything that catches your eye."}</p>
						</div>
						<div className="dd-filter">
							{["All", "Photography", "Typography", "Objects"].map((name) => (
								<button type="button" aria-pressed={filter === name} key={name} onClick={() => setFilter(name)}>
									{name}
								</button>
							))}
							<span>
								{savedOnly
									? saved.length
									: ITEMS.filter(
											(item) =>
												(filter === "All" || item.type === filter) &&
												item.title.toLowerCase().includes(search.toLowerCase()),
										).length}{" "}
								references
							</span>
						</div>
						<div className="dd-reference-grid">
							{ITEMS.map((item, i) =>
								(filter === "All" || item.type === filter) &&
								item.title.toLowerCase().includes(search.toLowerCase()) &&
								(!savedOnly || saved.includes(i)) ? (
									<button type="button" key={item.title} onClick={() => setOpened(i)}>
										<ReferenceArt kind={item.art} />
										<span>
											{item.title}
											<small>{item.type}</small>
										</span>
									</button>
								) : null,
							)}
						</div>
						{savedOnly && saved.length === 0 && (
							<p className="dd-empty">Open a reference and save it to start your collection.</p>
						)}
					</>
				)}
			</main>
		</div>
	);
}

function ReferenceArt({ kind }: { kind: string }) {
	return (
		<div className={cn("dd-reference-art", `dd-reference-${kind}`)}>
			{kind === "photo" || kind === "sea" ? (
				<img src={coast} alt="A quiet coastal building overlooking a blue sea" />
			) : kind === "type" ? (
				<Cover />
			) : kind === "poster" ? (
				<Cover index={2} />
			) : kind === "circle" ? (
				<>
					<i />
					<i />
					<span>form / 003</span>
				</>
			) : (
				<>
					<i />
					<i />
					<i />
					<i />
					<span>Objects of colour.</span>
				</>
			)}
		</div>
	);
}

function Cinema({ initial, headline }: { initial: DesktopScreen; headline: string }) {
	const [detail, setDetail] = useState(initial === "detail");
	const [saved, setSaved] = useState(false);
	const [list, setList] = useState(false);
	return (
		<div className="dd dd-cinema">
			<header>
				<button
					className="dd-film-logo"
					type="button"
					onClick={() => {
						setDetail(false);
						setList(false);
					}}
				>
					still<span>●</span>
				</button>
				<nav>
					<button
						type="button"
						aria-pressed={!list}
						onClick={() => {
							setList(false);
							setDetail(false);
						}}
					>
						Discover
					</button>
					<button type="button" aria-pressed={list} onClick={() => setList(true)}>
						Your watchlist <span>{saved ? "1" : "0"}</span>
					</button>
				</nav>
				<span>Cinema, at your own pace.</span>
			</header>
			{list ? (
				<div className="dd-film-list">
					<h1>Your watchlist.</h1>
					{saved ? (
						<button
							type="button"
							onClick={() => {
								setDetail(true);
								setList(false);
							}}
						>
							<img src={coast} alt="The quiet coast" />
							<span>
								The quiet coast<small>2026 · 98 min</small>
							</span>
							<span>↗</span>
						</button>
					) : (
						<p>Save a film to come back to it later.</p>
					)}
				</div>
			) : detail ? (
				<div className="dd-film-detail">
					<button type="button" onClick={() => setDetail(false)}>
						← Discover
					</button>
					<div>
						<img src={coast} alt="The quiet coast film still" />
						<section>
							<h1>The quiet coast</h1>
							<span>2026 · Drama · 98 min</span>
							<p>
								Returning to a house by the sea, a young architect finds that the places we leave behind never quite
								leave us.
							</p>
							<button type="button" aria-pressed={saved} onClick={() => setSaved(!saved)}>
								{saved ? "✓ On your watchlist" : "+ Add to watchlist"}
							</button>
							<dl>
								<dt>Directed by</dt>
								<dd>Elena Moreau</dd>
								<dt>Language</dt>
								<dd>French</dd>
								<dt>From the journal</dt>
								<dd>On coming home, and starting again.</dd>
							</dl>
							<small>Fictional film, made for this prototype.</small>
						</section>
					</div>
				</div>
			) : (
				<>
					<div className="dd-film-hero">
						<img src={coast} alt="A coastal house above a deep blue ocean" />
						<div>
							<h1>{headline}</h1>
							<p>The quiet coast</p>
							<span>Elena Moreau · 2026 · 98 min</span>
							<div>
								<button type="button" onClick={() => setDetail(true)}>
									Explore the film <span>↗</span>
								</button>
								<button
									type="button"
									className="dd-film-save"
									aria-label={saved ? "Remove from watchlist" : "Add to watchlist"}
									aria-pressed={saved}
									onClick={() => setSaved(!saved)}
								>
									{saved ? "✓" : "+"}
								</button>
							</div>
						</div>
					</div>
					<div className="dd-film-bottom">
						<h2>
							Worth sitting
							<br />
							still for.
						</h2>
						<p>
							Films that stay with you.
							<br />A new perspective, every week.
						</p>
						<button type="button" onClick={() => setDetail(true)}>
							This week's selection ↗
						</button>
					</div>
				</>
			)}
		</div>
	);
}

export function DesktopProduct({
	take,
	screen = "home",
	headline,
}: {
	take: DesktopTake;
	screen?: DesktopScreen;
	headline?: string;
}) {
	const title =
		headline ??
		(take === "music"
			? "Stay a little longer."
			: take === "records"
				? "Good things,\non repeat."
				: take === "library"
					? "Keep what moves you."
					: "Somewhere,\na little quieter.");
	return take === "library" ? (
		<Library initial={screen} headline={title} />
	) : take === "cinema" ? (
		<Cinema initial={screen} headline={title} />
	) : (
		<Music light={take === "records"} initial={screen} headline={title} />
	);
}
