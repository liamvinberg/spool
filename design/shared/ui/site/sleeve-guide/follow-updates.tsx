import { GuideIcon } from "./icons";
import "./follow-updates.css";

/** The update block chosen in site-follow-updates. */
export function FollowUpdates() {
	return (
		<section className="sm-updates sg-width" aria-labelledby="follow-heading">
			<div>
				<h2 id="follow-heading">See what I’m working on.</h2>
				<p>
					I’m Liam, the person building spool. I share new features, design experiments, and things I’m
					figuring out as I go.
				</p>
			</div>
			<a className="sm-follow" href="https://x.com/liamv1nberg" target="_blank" rel="noreferrer">
				Follow @liamv1nberg <GuideIcon name="arrow" />
			</a>
		</section>
	);
}
