import { CopyCommand, DOWNLOAD, INSTALL_COMMAND } from "../../../install";
import { GuideIcon } from "./icons";

function Download() {
	return (
		<a className="sm-download" href={DOWNLOAD}>
			Download for Mac <GuideIcon name="down" />
		</a>
	);
}

function Command({ command, placement }: { command: string; placement: string }) {
	return <CopyCommand command={command} className="sm-command" placement={placement} />;
}

function CLI() {
	return (
		<div className="sm-cli">
			<p>Install spool, then run it in your project folder.</p>
			<Command command={INSTALL_COMMAND} placement="terminal-details" />
			<Command command="spool init" placement="terminal-details" />
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
						<Command command={INSTALL_COMMAND} placement="start" />
					</div>
					<span className="sm-fine">Free · Apple silicon · macOS 14+</span>
				</div>
			</div>
			<Details />
		</section>
	);
}

export function ModernStart() {
	return <PlayStart />;
}
