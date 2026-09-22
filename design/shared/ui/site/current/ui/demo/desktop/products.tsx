import { useState } from "react";
import { cn } from "../../../lib/utils";
import { BackIcon, PlayIcon, SearchIcon } from "../../spool/icons";
import "./products.css";

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
					<button
						type="button"
						aria-current={page === "home" ? "page" : undefined}
						onClick={() => setPage("home")}
					>
						◈ <span>Listen now</span>
					</button>
					<button
						type="button"
						aria-current={page === "saved" ? "page" : undefined}
						onClick={() => setPage("saved")}
					>
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
						{TRACKS.filter((item) =>
							`${item.name} ${item.artist}`.toLowerCase().includes(search.toLowerCase()),
						).map((item) => (
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
						))}
						{!TRACKS.some((item) =>
							`${item.name} ${item.artist}`.toLowerCase().includes(search.toLowerCase()),
						) && <p>No tracks found. Try “Mira”.</p>}
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

export function DesktopProduct({ headline }: { headline: string }) {
	return <Music light initial="home" headline={headline} />;
}
