import { useEffect, useRef } from "react";
import { createBloomRenderer } from "shared/ui/site/current/ui/site/bloom/renderer";
import { ObjectLanding } from "./landing";
import "shared/ui/site/current/ui/site/bloom/page.css";
import "shared/ui/site/current/landing.css";
import "./page.css";
export function ProductObjectPage({ take }: { take: "package" | "dock" }) {
 const canvas = useRef<HTMLCanvasElement>(null);
 useEffect(() => { if (!canvas.current) return; const renderer = createBloomRenderer(canvas.current); return () => renderer?.dispose(); }, []);
 return <div className="bl-page" data-bloom="returns-end"><div className="bl-field" aria-hidden="true" data-backend="fallback"><canvas ref={canvas} className="bl-canvas" /></div><ObjectLanding take={take} /></div>;
}
