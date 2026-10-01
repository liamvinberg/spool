import "shared/ui/site/fresh/toy/toy.css";
import "./table.css";
import { useState } from "react";
import { SpoolMark } from "shared/ui/site/current/ui/spool/mark";
import { AUTHOR, CopyCommand, DOWNLOAD, INSTALL, REPO } from "shared/ui/site/fresh/toy/copy-command";
import { Desk, Sheet } from "./desk";

export default function Frame() {
	const [tidy, setTidy] = useState(false);
	return (
		<main className="toy table">
			<Desk tidy={tidy} className="table-desk">
				<header className="table-nav">
					<a href="https://spool.page/" className="table-brand" aria-label="spool home">
						<SpoolMark className="table-mark" />
						<span>spool</span>
					</a>
					<nav aria-label="Website">
						<button type="button" className="table-tidy" aria-pressed={tidy} onClick={() => setTidy((value) => !value)}>
							{tidy ? "scatter" : "tidy up"}
						</button>
						<a href={REPO}>GitHub</a>
					</nav>
				</header>

				<div className="table-print">
					<h1>
						A canvas for
						<br />
						working
						<br />
						things out.
					</h1>
					<p>Design websites, apps, and presentations with your agent. Try them live. Keep what works.</p>
				</div>

				<Sheet
					id="frame"
					label="Frames"
					w={280}
					h={350}
					spot={{ wide: { x: 0.57, y: 0.34, r: -6 }, narrow: { x: 0.44, y: 0.38, r: -5 } }}
					front={
						<>
							<p className="sheet-title">Your agent writes each frame as a file.</p>
							<code className="sheet-tag">frame.tsx</code>
						</>
					}
					back={
						<>
							<pre className="sheet-code">
								{"export default function Cart() {\n  return <Bag items={3} />;\n}"}
							</pre>
							<p className="sheet-note">Claude Code, Codex, or the agent you already use. It writes the TSX and spool shows it a moment later.</p>
						</>
					}
				/>
				<Sheet
					id="canvas"
					label="Canvas"
					w={300}
					h={300}
					spot={{ wide: { x: 0.785, y: 0.29, r: 5 }, narrow: { x: 0.58, y: 0.53, r: 4 } }}
					front={
						<>
							<p className="sheet-title">Every frame runs live, side by side.</p>
							<code className="sheet-tag">infinite canvas</code>
						</>
					}
					back={
						<>
							<p className="sheet-note">Lay the work out the way it makes sense to you. frame.json is where each one sits.</p>
							<pre className="sheet-code">{'{ "x": 1520, "y": 0,\n  "w": 390, "h": 844 }'}</pre>
						</>
					}
				/>
				<Sheet
					id="flow"
					label="Flows"
					w={340}
					h={230}
					spot={{ wide: { x: 0.69, y: 0.7, r: -3 }, narrow: { x: 0.46, y: 0.665, r: -3 } }}
					front={
						<>
							<p className="sheet-title">Link them up and click through.</p>
							<code className="sheet-tag">cart → checkout → paid</code>
						</>
					}
					back={
						<p className="sheet-note sheet-note--large">
							Buttons press and fields take typing. You find where it sticks before anything ships.
						</p>
					}
				/>
				<Sheet
					id="repo"
					label="Files"
					tone="ink"
					w={250}
					h={300}
					spot={{ wide: { x: 0.905, y: 0.71, r: 8 }, narrow: { x: 0.6, y: 0.79, r: 6 } }}
					front={
						<>
							<p className="sheet-title">It’s all files in your repo.</p>
							<code className="sheet-tag">git add design/</code>
						</>
					}
					back={
						<>
							<pre className="sheet-code">
								{"design/\n  frames/\n    cart/\n      frame.tsx\n      frame.json\n  shared/"}
							</pre>
							<p className="sheet-note">Git tracks every change, like the rest of your code.</p>
						</>
					}
				/>
				<Sheet
					id="get"
					label="Download"
					tone="thread"
					w={320}
					h={220}
					spot={{ wide: { x: 0.235, y: 0.8, r: -4 }, narrow: { x: 0.5, y: 0.905, r: -3 } }}
					front={
						<>
							<a className="sheet-download" href={DOWNLOAD}>
								<span>Download for Mac</span>
								<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
									<path d="M12 4v13m-6-6 6 6 6-6M5 20h14" strokeLinecap="round" strokeLinejoin="round" />
								</svg>
							</a>
							<p className="sheet-fine">Free and MIT licensed. Apple silicon, macOS 14 or later.</p>
						</>
					}
					back={
						<>
							<p className="sheet-note">Prefer the terminal?</p>
							<div className="sheet-terminal" data-no-drag>
								<CopyCommand command={INSTALL} />
								<CopyCommand command="spool init" />
							</div>
						</>
					}
				/>

				<footer className="table-foot">
					<p className="table-hint" aria-hidden="true">
						<span className="table-hint-wide">drag a sheet · tap to turn it over</span>
						<span className="table-hint-narrow">hold a sheet to move it · tap to turn it over</span>
					</p>
					<nav aria-label="Elsewhere">
						<a href={REPO}>GitHub</a>
						<a href={`${REPO}/blob/main/LICENSE`}>MIT licence</a>
						<a href={AUTHOR}>Made by Liam</a>
					</nav>
				</footer>
			</Desk>
		</main>
	);
}
