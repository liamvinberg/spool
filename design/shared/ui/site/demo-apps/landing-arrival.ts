import { type RefObject, useEffect } from "react";
import "./landing-arrival.css";

/** Hero motion starts with CSS on first paint. Only unseen sections wait for scroll. */
export function useLandingArrival(root: RefObject<HTMLDivElement | null>) {
	useEffect(() => {
		const page = root.current;
		if (!page) return;
		const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (preference.matches) return;
		const sections = page.querySelectorAll<HTMLElement>(".sg-section, .sm-start, .sm-updates");
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (!entry.isIntersecting || !(entry.target instanceof HTMLElement)) continue;
					entry.target.dataset.arrival = "shown";
					observer.unobserve(entry.target);
				}
			},
			{ rootMargin: "0px 0px -24px 0px" },
		);
		for (const section of sections) {
			if (section.getBoundingClientRect().top < window.innerHeight) continue;
			section.dataset.arrival = "waiting";
			observer.observe(section);
		}
		const settle = () => {
			observer.disconnect();
			for (const section of sections) delete section.dataset.arrival;
		};
		const focus = (event: FocusEvent) => {
			if (!(event.target instanceof Element)) return;
			const section = event.target.closest<HTMLElement>("[data-arrival]");
			if (!section) return;
			observer.unobserve(section);
			delete section.dataset.arrival;
		};
		page.addEventListener("focusin", focus);
		page.addEventListener("keydown", settle);
		preference.addEventListener("change", settle);
		return () => {
			settle();
			page.removeEventListener("focusin", focus);
			page.removeEventListener("keydown", settle);
			preference.removeEventListener("change", settle);
		};
	}, [root]);
}
