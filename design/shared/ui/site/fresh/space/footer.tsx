import { cn } from "shared/lib/utils";
import { SpoolMark } from "shared/ui/spool/mark";
import { REPO } from "./install";

/** The foot both space takes end on: who made it, the command, the links. */
export function SpaceFooter({ className }: { className?: string }) {
	return (
		<footer className={cn("sp-footer", className)}>
			<div className="sp-footer-top">
				<p>
					Made by Liam. I post what I'm building on X as <a href="https://x.com/liamvinberg">@liamvinberg</a>.
				</p>
				<p className="sp-terminal">
					<span>~/your-project $</span> spool init
				</p>
			</div>
			<div className="sp-footer-bottom">
				<span className="sp-brand">
					<SpoolMark className="sp-mark" />
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
