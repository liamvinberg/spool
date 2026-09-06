import { cn } from "shared/lib/utils";
import type { Artwork } from "./data";

/** Small, authored demo products. The home chrome stays in spool's own tokens. */
export function ProjectArtwork({ kind, className }: { kind: Artwork; className?: string }) {
	return (
		<div className={cn("home-art", `home-art-${kind}`, className)} aria-hidden="true">
			{kind === "coast" && (
				<>
					<div className="coast-nav">
						<b>Tvärsö</b>
						<span>The island &nbsp; Stay &nbsp; Visit</span>
						<i>Book a stay ↗</i>
					</div>
					<div className="coast-body">
						<span>59° 12′ N · 18° 28′ E</span>
						<h3>
							A little closer
							<br />
							to nowhere.
						</h3>
						<p>
							Cabins, saltwater, and the time
							<br />
							to take it all in.
						</p>
						<i>Find your cabin ↗</i>
					</div>
					<div className="coast-island">
						<div />
						<div />
						<div />
					</div>
					<div className="coast-foot">
						<span>A place to slow down.</span>
						<span>Stockholm archipelago</span>
					</div>
				</>
			)}
			{kind === "coffee" && (
				<>
					<div className="coffee-nav">
						<b>kaffe.</b>
						<span>Good mornings start here.</span>
						<span>Bag (2)</span>
					</div>
					<div className="coffee-body">
						<div>
							<span>Roasted in small batches.</span>
							<h3>
								Make it
								<br />a slow one.
							</h3>
							<i>Find your coffee ↗</i>
						</div>
						<div className="coffee-bag">
							<b>kaffe.</b>
							<div />
							<strong>
								EVERYDAY
								<br />
								BLEND
							</strong>
							<span>
								Chocolate · hazelnut
								<br />
								250 g / whole bean
							</span>
						</div>
					</div>
					<div className="coffee-foot">Better coffee. Same kitchen.</div>
				</>
			)}
			{kind === "notes" && (
				<>
					<div className="notes-rail">
						<b>fieldnotes</b>
						<span>All notes</span>
						<span>Ideas</span>
						<span>Reading</span>
						<span>Archive</span>
						<i>+ New note</i>
					</div>
					<div className="notes-page">
						<span>September 6</span>
						<h3>
							On noticing
							<br />
							small things.
						</h3>
						<p>A walk without a destination. The color of the water on the way home.</p>
						<p>
							There is something in the everyday that is easy to pass by. A small detail, a familiar shape, seen
							for the first time.
						</p>
						<div />
						<span>One thought at a time.</span>
					</div>
				</>
			)}
			{kind === "studio" && (
				<>
					<div className="studio-nav">
						<b>studio</b>
						<span>Work &nbsp; About &nbsp; Contact ↗</span>
					</div>
					<h3>
						Good things
						<br />
						take shape.
					</h3>
					<div className="studio-blocks">
						<div>
							<i />
						</div>
						<div>
							<i />
						</div>
					</div>
					<div className="studio-foot">
						<span>Selected work, 2026</span>
						<span>Independent by design.</span>
					</div>
				</>
			)}
			{kind === "system" && (
				<>
					<div className="system-heading">
						<span>spool</span>
						<span>primitives / 01</span>
					</div>
					<div className="system-type">
						Aa
						<span>
							Familjen Grotesk
							<br />
							Regular · Medium · Semibold
						</span>
					</div>
					<div className="system-swatches">
						<i />
						<i />
						<i />
						<i />
						<i />
					</div>
					<div className="system-controls">
						<b>Continue ↗</b>
						<span>Open project</span>
						<i />
					</div>
					<div className="system-field">
						Name your project <span>↵</span>
					</div>
				</>
			)}
			{kind === "slack" && (
				<>
					<div className="slack-top">Search workspace</div>
					<div className="slack-side">
						<b>Acme⌄</b>
						<span>Threads</span>
						<span>Drafts</span>
						<br />
						<span>Channels</span>
						<strong># releases</strong>
						<span># design</span>
						<span># general</span>
					</div>
					<div className="slack-messages">
						<b># releases</b>
						<div className="slack-message">
							<i>S</i>
							<div>
								<strong>
									Shipbot <small>APP &nbsp; 10:42</small>
								</strong>
								<p>The next version is ready to review.</p>
								<div className="slack-bot">
									Release preview
									<br />
									<span>Checkout · 4 screens</span>
									<em>Open prototype ↗</em>
								</div>
							</div>
						</div>
						<div className="slack-message">
							<i>A</i>
							<div>
								<strong>
									Alex <small>10:43</small>
								</strong>
								<p>Taking a look now.</p>
							</div>
						</div>
						<div className="slack-compose">
							Message #releases <span>↗</span>
						</div>
					</div>
				</>
			)}
			{kind === "blank" && (
				<div className="blank-art">
					<span>+</span>
					<p>Room for an idea.</p>
				</div>
			)}
		</div>
	);
}

export function CanvasArtwork({ kind }: { kind: Artwork }) {
	return (
		<div className="home-canvas-art" aria-hidden="true">
			<div className="canvas-art-row">
				<div>
					<span>01 / start</span>
					<ProjectArtwork kind={kind} />
				</div>
				<div>
					<span>02 / explore</span>
					<ProjectArtwork kind={kind} />
				</div>
				<div>
					<span>03 / detail</span>
					<ProjectArtwork kind={kind} />
				</div>
			</div>
			<div className="canvas-art-thread" />
			<div className="canvas-art-note">try the whole flow ↗</div>
		</div>
	);
}
