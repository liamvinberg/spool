import { useState } from "react";
import { GuideIcon } from "./icons";

export type ModernTake = "crisp" | "air" | "play";
const REPO = "https://github.com/liamvinberg/spool";
const DOWNLOAD = `${REPO}/releases/latest/download/Spool.dmg`;

function Download() {
	return (
		<a className="sm-download" href={DOWNLOAD}>
			Download for Mac <GuideIcon name="down" />
		</a>
	);
}

function Command({ command }: { command: string }) {
	const [status, setStatus] = useState("Copy command");
	return (
		<button
			className="sm-command"
			type="button"
			aria-label={`${status}: ${command}`}
			onClick={() => {
				void navigator.clipboard.writeText(command).then(
					() => setStatus("Copied"),
					() => setStatus("Select and copy the command"),
				);
			}}
		>
			<code>{command}</code>
			<span aria-live="polite">{status === "Copied" ? "Copied" : <GuideIcon name="copy" />}</span>
		</button>
	);
}

function CLI() {
	return (
		<div className="sm-cli">
			<p>Install spool, then run it in your project folder.</p>
			<Command command="npm i -g spool.page" />
			<Command command="spool init" />
			<small>Node 22+ and Chrome. macOS, Linux, or Windows via WSL.</small>
		</div>
	);
}

function Details() {
	return (
		<details className="sm-details">
			<summary>
				More of a terminal person? <GuideIcon name="down" />
			</summary>
			<CLI />
		</details>
	);
}

function CrispStart() {
	const [method, setMethod] = useState<"mac" | "cli">("mac");
	return (
		<section id="start" className="sm-start sm-crisp-start sg-width">
			<div className="sm-start-heading">
				<h2>Your turn.</h2>
				<p>Bring an idea. See where it goes.</p>
				<span>Free. Open source. On your machine.</span>
			</div>
			<div className="sm-get">
				<div className="sm-methods" role="group" aria-label="Installation method">
					<button type="button" aria-pressed={method === "mac"} onClick={() => setMethod("mac")}>
						Mac app
					</button>
					<button type="button" aria-pressed={method === "cli"} onClick={() => setMethod("cli")}>
						Command line
					</button>
				</div>
				<div className="sm-method-body">
					{method === "mac" ? (
						<>
							<h3>A canvas of your own.</h3>
							<p>Get spool, open your project, and ask your agent for a first take.</p>
							<Download />
							<small>Apple silicon · macOS 14+</small>
						</>
					) : (
						<CLI />
					)}
				</div>
				<a className="sm-docs" href={`${REPO}#install`}>
					Need a hand getting set up? <GuideIcon name="arrow" />
				</a>
			</div>
		</section>
	);
}

function AirStart() {
	return (
		<section id="start" className="sm-start sm-air-start sg-width">
			<h2>Something in mind?</h2>
			<p>
				Open a canvas. Give your agent a direction.
				<br />
				See what you make of it.
			</p>
			<Download />
			<span className="sm-fine">Free and open source · Apple silicon · macOS 14+</span>
			<Details />
		</section>
	);
}

function PlayStart() {
	return (
		<section id="start" className="sm-start sm-play-start sg-width">
			<div className="sm-play-top">
				<h2>
					Your turn<span>.</span>
				</h2>
				<GuideIcon name="right" />
			</div>
			<div className="sm-play-bottom">
				<div>
					<p>That idea you keep coming back to?</p>
					<p>Try it in spool.</p>
				</div>
				<div>
					<div className="sm-play-install">
						<Download />
						<Command command="npm i -g spool.page" />
					</div>
					<span className="sm-fine">Free · Apple silicon · macOS 14+</span>
				</div>
			</div>
			<Details />
		</section>
	);
}

export function ModernStart({ take }: { take: ModernTake }) {
	if (take === "air") return <AirStart />;
	if (take === "play") return <PlayStart />;
	return <CrispStart />;
}
