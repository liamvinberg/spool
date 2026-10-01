import { SpoolMark } from "shared/ui/spool/mark";
import { DOWNLOAD, REPO } from "./install";

/** The header both glyph films pin over their stage. */
export function GlyphHead() {
	return (
		<header className="gp-head">
			<a className="gp-brand" href="https://spool.page/" aria-label="spool home">
				<SpoolMark className="gp-mark" />
				<span>spool</span>
			</a>
			<nav aria-label="Website">
				<a href={`${REPO}#readme`}>Docs</a>
				<a href={REPO}>GitHub</a>
				<a href={DOWNLOAD}>Download</a>
			</nav>
		</header>
	);
}

/** The footer after the film lets go of the page. */
export function GlyphFoot() {
	return (
		<footer className="gp-foot">
			<div className="gp-foot-top">
				<p>
					Made by Liam. I post what I'm building on X as <a href="https://x.com/liamvinberg">@liamvinberg</a>.
				</p>
				<p className="gp-terminal">
					<span>~/your-project $</span> spool init
				</p>
			</div>
			<div className="gp-foot-bottom">
				<span className="gp-brand">
					<SpoolMark className="gp-mark" />
					<span>spool</span>
				</span>
				<nav aria-label="Footer">
					<a href={`${REPO}#readme`}>Docs</a>
					<a href={REPO}>GitHub</a>
					<a href={`${REPO}/blob/main/LICENSE.md`}>MIT licence</a>
					<a href="https://spool.page/privacy">Privacy</a>
				</nav>
			</div>
		</footer>
	);
}
