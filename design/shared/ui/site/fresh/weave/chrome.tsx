import { SpoolMark } from "shared/ui/spool/mark";
import { DOWNLOAD, REPO } from "./install";

/** The bar over the pinned stage: the name on the left, three ways out on the right. */
export function WeaveHead() {
	return (
		<header className="wv-head">
			<a className="wv-brand" href="https://spool.page/" aria-label="spool home">
				<SpoolMark className="wv-mark" />
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

/** The page's foot, after the film has ended. */
export function WeaveFooter() {
	return (
		<footer className="wv-footer">
			<div className="wv-footer-top">
				<p>
					Made by Liam. I post what I'm building on X as <a href="https://x.com/liamvinberg">@liamvinberg</a>.
				</p>
				<p className="wv-terminal">
					<span>~/your-project $</span> spool init
				</p>
			</div>
			<div className="wv-footer-bottom">
				<span className="wv-brand">
					<SpoolMark className="wv-mark" />
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
