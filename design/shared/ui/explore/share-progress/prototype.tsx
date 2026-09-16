import { useEffect, useState } from "react";
import { ShareCanvas, ShareMenu } from "shared/ui/explore/share/share-canvas";
import "./prototype.css";

// Throwaway exploration: three placements, separate visible frames. All jobs and links are simulated.
type Take = "sheet" | "tray" | "label";
type Stage = "setup" | "preparing" | "uploading" | "finishing" | "ready" | "failed" | "changed";
const status: Record<Stage, string> = {
 setup: "not shared", preparing: "preparing frames", uploading: "uploading", finishing: "making link ready",
 ready: "shared", failed: "upload interrupted", changed: "unpublished changes",
};
export function ShareProgressPrototype({ take, initial = "setup", menuInitially = false }: { take: Take; initial?: Stage; menuInitially?: boolean }) {
 const [stage, setStage] = useState<Stage>(initial);
 const [sheet, setSheet] = useState(initial === "setup" && !menuInitially || take === "sheet");
 const [menu, setMenu] = useState(menuInitially);
 const [email, setEmail] = useState("alex@kaffe.se");
 const [bytes, setBytes] = useState(7.4);
 const [playing, setPlaying] = useState(false);
 const [copied, setCopied] = useState(false);
 const [copyProblem, setCopyProblem] = useState(false);
 const [updating, setUpdating] = useState(initial === "changed");
 const [details, setDetails] = useState(false);
 const busy = stage === "preparing" || stage === "uploading" || stage === "finishing";
 useEffect(() => {
  if (!playing) return;
  const timer = window.setTimeout(() => {
   if (stage === "preparing") setStage("uploading");
   else if (stage === "uploading") {
    if (bytes >= 18.6) setStage("finishing");
    else setBytes(Math.min(18.6, bytes + 1.4));
   } else if (stage === "finishing") { setStage("ready"); setPlaying(false); }
  }, stage === "uploading" ? 650 : 1800);
  return () => window.clearTimeout(timer);
 }, [stage, playing, bytes]);
 useEffect(() => {
  const dismiss = (event: KeyboardEvent) => { if (event.key === "Escape") { setSheet(false); setMenu(false); } };
  window.addEventListener("keydown", dismiss);
  return () => window.removeEventListener("keydown", dismiss);
 }, []);
 const begin = () => { setBytes(0); setStage("preparing"); setPlaying(true); setCopied(false); if (take !== "sheet") setSheet(false); };
 const retry = () => { setStage("uploading"); setPlaying(true); };
 const copy = async () => {
  try { await navigator.clipboard.writeText("https://spool.page/s/demo-cart"); setCopied(true); setCopyProblem(false); }
  catch { setCopyProblem(true); }
 };
 const progress = <div className="sp-progress" aria-live="polite">
  <div className="sp-between"><strong>{status[stage]}</strong><span className="sp-mono">{stage === "uploading" ? `${Math.floor(bytes / 18.6 * 100)}%` : stage === "failed" ? "paused" : ""}</span></div>
  {stage === "uploading" || stage === "failed" ? <>
   <progress aria-label="Bytes uploaded" max={18.6} value={bytes} />
   <div className="sp-between sp-muted sp-mono"><span>{bytes.toFixed(1)} / 18.6 mb</span><span>{stage === "failed" ? "connection lost" : "upload"}</span></div>
  </> : <p className="sp-muted">{stage === "preparing" ? "Preparing cart and its connected frames." : "Upload complete. Checking the link before it opens."}</p>}
  <div className="sp-steps"><span>✓ prepare</span><span>{stage === "finishing" ? "✓" : "↑"} upload</span><span>○ ready</span></div>
 </div>;
 const result = <>
  <div className="sp-between"><strong>{updating ? "Link updated" : "Your link is ready"}</strong><span className="sp-success">✓</span></div>
  <input className="sp-link" aria-label="Demo share link" readOnly value="https://spool.page/s/demo-cart" onFocus={(event) => event.target.select()} />
  <div className="sp-between"><span className="sp-muted">Only {email} can open it.</span><button type="button" className="sp-primary" onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button></div>
  <p className="sp-muted">Send them the link. An email hasn’t been sent.</p>
  {copyProblem && <p role="alert">Select the link above and copy it manually.</p>}
 </>;
 const job = <>
  <div className="sp-between sp-job-title"><span className="sp-mono">cart <span className="sp-muted">· 2 frames in journey</span></span>{!sheet && <button type="button" className="sp-text" onClick={() => setSheet(true)}>Details ↗</button>}</div>
  {stage === "ready" ? result : stage === "changed" ? <>
   <strong>Your edits are still local.</strong><p className="sp-muted">Update the same link when you’re ready.</p>
   <button type="button" className="sp-primary" onClick={begin}>Update link</button>
  </> : <>{progress}{stage === "failed" ? <div className="sp-between"><span className="sp-muted">Retry this upload.</span><button type="button" className="sp-primary" onClick={retry}>Retry</button></div> : <p className="sp-muted">{updating ? "The previous version stays available." : "Keep working. Sharing continues in the background."}</p>}</>}
 </>;
 return <div className="sp-prototype">
  <ShareCanvas shared={false} menu={menu ? <ShareMenu at={{ x: 470, y: 220 }} onShare={() => { setMenu(false); setSheet(true); }} /> : undefined} overlay={<>
   <button type="button" className="sp-frame-status" style={{ left: 374, top: 166 }} onClick={() => setSheet(true)} onContextMenu={(event) => { event.preventDefault(); setMenu(true); }}>
    {busy ? "↑" : stage === "failed" ? "!" : "↗"} {status[stage]}{stage === "uploading" ? ` · ${Math.floor(bytes / 18.6 * 100)}%` : ""}
   </button>
   <button type="button" className="sp-frame-hit" aria-label="Share cart" onContextMenu={(event) => { event.preventDefault(); setMenu(true); }} onClick={() => setSheet(true)} />
   {!sheet && !menu && stage !== "setup" && <section className={`sp-job sp-job-${take}`} aria-label="Share progress">{job}</section>}
   {sheet && <div className={`sp-sheet-wrap ${take === "sheet" ? "sp-centered" : ""}`}>
    <section className="sp-sheet" aria-label="Share cart">
     <header className="sp-between"><h1>Share cart</h1><button type="button" className="sp-text" aria-label="Close sharing" onClick={() => setSheet(false)}>✕</button></header>
     <div className="sp-body">
      <p className="sp-muted">A playable journey, starting from cart.</p>
      <button type="button" className="sp-scope sp-between" onClick={() => setDetails(!details)}><span>cart → receipt</span><span className="sp-muted">2 frames {details ? "−" : "+"}</span></button>
      {details && <p className="sp-muted">Includes cart and receipt. The menu frame is outside this journey.</p>}
      {stage === "setup" ? <form onSubmit={(event) => { event.preventDefault(); begin(); }}>
       <label htmlFor="sp-email">Who should see it?</label>
       <input id="sp-email" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
       <p className="sp-muted">Only people you add can open the link.</p>
       <button type="button" className="sp-primary sp-full" disabled={!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)} onClick={begin}>Create link</button>
       <p className="sp-muted">You’ll copy and send the link once it’s ready.</p>
      </form> : stage === "ready" ? result : job}
     </div>
     <footer>{busy ? <button type="button" className="sp-text" onClick={() => setSheet(false)}>Continue working ↗</button> : <span className="sp-muted">Edits stay local until you update the link.</span>}</footer>
    </section>
   </div>}
  </>} />
  <div className="sp-demo"><span>prototype · simulated upload</span><span>{take === "tray" ? "B · background tray · recommended" : take === "sheet" ? "A · share sheet" : "C · beside the frame"}</span><div>
   <button type="button" onClick={() => { setStage("setup"); setSheet(false); setMenu(true); setPlaying(false); }}>Right-click menu</button>
   {busy && <button type="button" onClick={() => { setPlaying(false); setStage("failed"); }}>Interrupt upload</button>}
   {stage === "ready" && <button type="button" onClick={() => { setUpdating(true); setStage("changed"); setCopied(false); }}>Simulate local edit</button>}
   <button type="button" onClick={() => { setStage("setup"); setSheet(true); setMenu(false); setPlaying(false); setUpdating(false); }}>Restart</button>
  </div></div>
 </div>;
}
