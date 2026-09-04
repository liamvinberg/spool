import { useState } from "react";
import { Cover, DesktopProduct } from "shared/ui/demo/desktop/products";
import { PlayIcon } from "shared/ui/spool/icons";
import "./variations.css";

export type SleeveTake = "shelf" | "catalog" | "listening";
export const SLEEVE_TAKES: readonly SleeveTake[] = ["shelf", "catalog", "listening"];
export const SLEEVE_NAMES: Record<SleeveTake, string> = {
	shelf: "The record shelf",
	catalog: "The split catalog",
	listening: "The listening room",
};

const ALBUMS = ["Soft focus", "Blue hours", "Every other day", "Sun room"] as const;
const ARTISTS = ["Mira Sol", "Pacific Hotel", "Form & Field", "Sunday Service"] as const;
const SONGS = ["A little longer", "Room with a view", "In the middle of June", "Nothing in particular"] as const;

function ListeningRoom() {
	const [album, setAlbum] = useState(0);
	const [track, setTrack] = useState(0);
	const [playing, setPlaying] = useState(false);
	const [saved, setSaved] = useState(false);
	const [library, setLibrary] = useState(false);
	const [position, setPosition] = useState(26);
	return (
		<div className="sv-room">
			<header>
				<button
					type="button"
					className="sv-room-logo"
					onClick={() => {
						setLibrary(false);
						setAlbum(0);
					}}
				>
					◕ sleeve
				</button>
				<nav>
					<button type="button" aria-pressed={!library} onClick={() => setLibrary(false)}>
						Listening room
					</button>
					<button type="button" aria-pressed={library} onClick={() => setLibrary(true)}>
						Your records
					</button>
				</nav>
				<span>A little space for music.</span>
			</header>
			{library ? (
				<section className="sv-room-library">
					<h1>Your records.</h1>
					<div>
						{ALBUMS.map((title, i) => (
							<button
								type="button"
								key={title}
								onClick={() => {
									setAlbum(i);
									setTrack(0);
									setLibrary(false);
								}}
							>
								<Cover index={i} />
								<span>
									{title}
									<small>{ARTISTS[i]}</small>
								</span>
							</button>
						))}
					</div>
				</section>
			) : (
				<main>
					<div className="sv-room-art">
						<div className="sv-record" />
						<Cover index={album} />
					</div>
					<section>
						<span>{ARTISTS[album]}</span>
						<h1>{ALBUMS[album]}</h1>
						<p>Take your time with this one.</p>
						<div className="sv-room-actions">
							<button type="button" className="sv-room-play" onClick={() => setPlaying(!playing)}>
								<PlayIcon />
								{playing ? "Pause record" : "Play record"}
							</button>
							<button
								type="button"
								className="sv-room-save"
								aria-label={saved ? "Unsave record" : "Save record"}
								aria-pressed={saved}
								onClick={() => setSaved(!saved)}
							>
								{saved ? "♥" : "♡"}
							</button>
						</div>
						<div className="sv-room-tracks">
							{SONGS.map((song, i) => (
								<button
									type="button"
									data-active={i === track}
									key={song}
									onClick={() => {
										setTrack(i);
										setPlaying(true);
									}}
								>
									<span>{playing && i === track ? "Ⅱ" : `0${i + 1}`}</span>
									<span>{song}</span>
									<small>{i % 2 ? "3:48" : "4:12"}</small>
								</button>
							))}
						</div>
					</section>
				</main>
			)}
			<footer>
				<div>
					<span className="sv-room-led" data-playing={playing} />
					<span>
						{SONGS[track]}
						<small>{ARTISTS[album]}</small>
					</span>
				</div>
				<div className="sv-room-transport">
					<button type="button" aria-label="Previous song" onClick={() => setTrack((track + 3) % 4)}>
						Ⅰ‹
					</button>
					<button type="button" aria-label={playing ? "Pause song" : "Play song"} onClick={() => setPlaying(!playing)}>
						{playing ? "Ⅱ" : <PlayIcon />}
					</button>
					<button
						type="button"
						aria-label="Next song"
						onClick={() => {
							setTrack((track + 1) % 4);
							setPosition(0);
						}}
					>
						›Ⅰ
					</button>
				</div>
				<input
					type="range"
					aria-label="Song position"
					value={position}
					onChange={(event) => setPosition(Number(event.target.value))}
				/>
				<span>Interactive preview · audio off</span>
			</footer>
		</div>
	);
}

export function SleeveProduct({
	take = "shelf",
	headline = "Good things,\non repeat.",
}: {
	take?: SleeveTake;
	headline?: string;
}) {
	return take === "listening" ? (
		<ListeningRoom />
	) : (
		<div className={`sv-product sv-${take}`}>
			<DesktopProduct take="records" headline={headline} />
		</div>
	);
}
