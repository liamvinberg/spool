import { ModernStart } from "shared/ui/site/current/ui/site/sleeve-guide/modern-start";
import { SpoolMark } from "shared/ui/site/current/ui/spool/mark";
import "./ending.css";

export type EndingTake = "close" | "inline" | "split";
const REPO = "https://github.com/liamvinberg/spool";

export function LandingEnding({ take }: { take: EndingTake }) {
	return (
		<div className="ee-ending" data-ending={take}>
			<ModernStart />
			<div className="ee-note sg-width">
				<p>I’m Liam, the person building spool. Follow along as it takes shape.</p>
				<a href="https://x.com/liamv1nberg" target="_blank" rel="noreferrer">
					Follow @liamv1nberg
				</a>
			</div>
			<footer className="ee-footer sg-width">
				<span className="sg-brand">
					<SpoolMark />
					<span>spool</span>
				</span>
				<span>Made in spool. Of course.</span>
				<nav aria-label="Footer">
					<a href={`${REPO}#readme`}>Docs</a>
					<a href={REPO}>GitHub</a>
					<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
					<a href="https://spool.page/privacy#settings">Privacy &amp; cookies</a>
				</nav>
			</footer>
		</div>
	);
}
