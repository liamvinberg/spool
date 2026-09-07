import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { ReceivedIndicator } from "shared/ui/explore/agent/received-indicator";
import { paragraphsOf } from "shared/ui/spool/agent-said";
import { receivedAt } from "shared/lib/explore/agent/received-text";
import recording from "shared/lib/explore/agent/received-recording.json";
import "./received-next.css";

export type ReceivingTake = "typesetter" | "scanlines" | "constellation" | "ribbon-feed" | "receipt" | "tuning" | "aperture" | "stepping" | "echo" | "bookend";
const indices = (n: number) => Array.from({ length: n }, (_, i) => i);
const stagger = (i: number) => ({ "--i": i } as CSSProperties);

function LoadingInk({ take, count }: { take: ReceivingTake; count: number }) {
	switch (take) {
		case "typesetter": return <span className="rn-typesetter">{[9, 7, 5].map((n, row) => <span key={row}>{indices(n).map(i => <i key={i} style={{ ...stagger(i + row * 3), width: [19, 31, 13, 25, 38][(i + row) % 5] }} />)}</span>)}</span>;
		case "scanlines": return <span className="rn-scanlines">{[218, 186, 122].map((width, i) => <i key={i} style={{ ...stagger(i), width }} />)}<b /></span>;
		case "constellation": return <svg className="rn-constellation" width="190" height="46" viewBox="0 0 190 46"><path d="M5 30L33 14L62 29L96 10L126 27L169 17" />{[[5,30],[33,14],[62,29],[96,10],[126,27],[169,17]].map(([cx,cy],i) => <circle key={i} cx={cx} cy={cy} r={i === 3 ? 2 : 1.5} style={stagger(i)} />)}</svg>;
		case "ribbon-feed": return <span className="rn-ribbon"><span>{indices(16).map(i => <i key={i} style={{ height: [3,8,5,12,6,4,10][i % 7] }} />)}</span><b /></span>;
		case "receipt": return <span className="rn-receipt"><span className="rn-receipt-rule" /><span className="rn-receipt-label">next paragraph<span>{count.toLocaleString()} chars</span></span><span className="rn-receipt-ticks">{indices(32).map(i => <i key={i} data-filled={i < Math.min(32, Math.ceil(count / 16))} />)}</span></span>;
		case "tuning": return <span className="rn-tuning">{indices(5).map(i => <i key={i} style={stagger(i)} />)}</span>;
		case "aperture": return <span className="rn-aperture"><i /><b /></span>;
		case "stepping": return <span className="rn-stepping">{indices(4).map(i => <i key={i} style={stagger(i)} />)}</span>;
		case "echo": return <span className="rn-echo"><i /><i /><b /></span>;
		case "bookend": return <span className="rn-bookend"><i /><span /><b /></span>;
	}
}

/** Ten alternatives on the same recorded input. Larger marks reserve their own next-paragraph space. */
export function ReceivedNext({ take, history = false }: { take: ReceivingTake; history?: boolean }) {
	const root = useRef<HTMLDivElement>(null);
	const [marker, setMarker] = useState<HTMLElement | null>(null);
	const [count, setCount] = useState(0);
	useEffect(() => {
		const host = root.current;
		if (!host) return;
		let lastElapsed = -1;
		const update = () => {
			setMarker(host.querySelector<HTMLElement>("[data-received-marker]"));
			if (take !== "receipt") return;
			const elapsed = Number(host.querySelector<HTMLElement>("[data-source-elapsed]")?.dataset.sourceElapsed ?? 0);
			if (elapsed === lastElapsed) return;
			lastElapsed = elapsed;
			const text = receivedAt({ ...recording, timing: recording.timing === "recorded" ? "recorded" : "estimated" }, elapsed);
			setCount((paragraphsOf(text).at(-1) ?? "").length);
		};
		update();
		const observer = new MutationObserver(update);
		observer.observe(host, { childList: true, subtree: true, attributes: true, attributeFilter: ["data-source-elapsed"] });
		return () => observer.disconnect();
	}, [take]);
	return <div ref={root} className="received-next" data-loading-take={take}>
		<ReceivedIndicator take="wind" history={history} />
		{marker ? createPortal(<span className="rn-ink" aria-hidden="true"><LoadingInk take={take} count={count} /></span>, marker) : null}
	</div>;
}
