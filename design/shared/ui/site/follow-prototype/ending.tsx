import { SpoolMark } from "shared/ui/spool/mark";
import { GuideIcon } from "shared/ui/site/sleeve-guide/icons";
import { ModernStart } from "shared/ui/site/sleeve-guide/modern-start";
import "shared/ui/site/sleeve-guide/guide.css";
import "shared/ui/site/sleeve-guide/modern.css";
import "./ending.css";

// Three closing-section prototypes: how prominent should the invitation to follow be?
export type FollowTake = "credit" | "updates" | "letter";
const X = "https://x.com/liamv1nberg";
const REPO = "https://github.com/liamvinberg/spool";

function FollowLink() {
	return <a className="fp-follow" href={X} target="_blank" rel="noreferrer">
		Follow @liamv1nberg <GuideIcon name="arrow" />
	</a>;
}

function Footer({ take }: { take: FollowTake }) {
	return <footer className="fp-footer sg-width">
		<a className="sg-brand" href="https://spool.page" aria-label="spool home"><SpoolMark /><span>spool</span></a>
		{take === "credit" ? <div className="fp-credit">
			<span>Built by Liam.</span>
			<a href={X} target="_blank" rel="noreferrer">Follow the work <GuideIcon name="arrow" /></a>
		</div> : <span className="fp-made">Made in spool. Of course.</span>}
		<nav aria-label="Footer">
			<a href={`${REPO}#readme`}>Docs <GuideIcon name="arrow" /></a>
			<a href={REPO}>GitHub <GuideIcon name="arrow" /></a>
			<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
		</nav>
	</footer>;
}

function Updates() {
	return <section className="fp-updates sg-width" aria-labelledby="follow-heading">
		<div>
			<h2 id="follow-heading">See what I’m working on.</h2>
			<p>I’m Liam, the person building spool. I share new features, design experiments, and things I’m figuring out as I go.</p>
		</div>
		<FollowLink />
	</section>;
}

function Letter() {
	return <section className="fp-letter sg-width" aria-labelledby="follow-heading">
		<div className="fp-letter-title"><h2 id="follow-heading">There’s more<br />in the making.</h2></div>
		<div className="fp-letter-body">
			<p>I’m Liam. I’m building spool, and I share the work along the way.</p>
			<p>Early ideas, little demos, and the details that take a few tries to get right. If you’re curious about where it goes next, come follow along.</p>
			<FollowLink />
		</div>
	</section>;
}

export function FollowEnding({ take }: { take: FollowTake }) {
	return <div className="sg-page sm-page fp-page" data-take="play" data-follow={take}>
		<main>
			<ModernStart take="play" />
			{take === "updates" ? <Updates /> : take === "letter" ? <Letter /> : null}
		</main>
		<Footer take={take} />
	</div>;
}
