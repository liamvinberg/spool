import { AnimatePresence, motion, useIsPresent } from "motion/react";
import { AccessEditor, type Access } from "./access";
import { type ReactNode, useEffect, useState } from "react";
import { ShareCanvas, ShareMenu } from "shared/ui/explore/share/share-canvas";
import "./prototype.css";

// Throwaway exploration: three placements, separate visible frames. All jobs and links are simulated.
const EASE = [0.23, 1, 0.32, 1] as const;
type Indicator = "text" | "ring" | "thread";
type Take = "sheet" | "tray" | "label";
type Stage = "setup" | "preparing" | "uploading" | "finishing" | "ready" | "failed" | "changed";
const status: Record<Stage, string> = {
 setup: "not shared", preparing: "preparing frames", uploading: "uploading", finishing: "making link ready",
 ready: "shared", failed: "upload interrupted", changed: "unpublished changes",
};
export function ShareProgressPrototype({ take, initial = "setup", menuInitially = false, initialAccess = "invited", indicator = "text" }: { take: Take; initial?: Stage; menuInitially?: boolean; initialAccess?: Access; indicator?: Indicator }) {
 const [stage, setStage] = useState<Stage>(initial);
 const [sheet, setSheet] = useState(initial === "setup" && !menuInitially || take === "sheet");
 const [menu, setMenu] = useState(menuInitially);
 const [access, setAccess] = useState<Access>(initialAccess);
 const [recipients, setRecipients] = useState(["alex@kaffe.se", "sam@kaffe.se"]);
 const [editingAccess, setEditingAccess] = useState(false);
 const [savedAccess, setSavedAccess] = useState<Access>(initialAccess);
 const [savedRecipients, setSavedRecipients] = useState(recipients);
 const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
 useEffect(() => {
  const query = window.matchMedia("(prefers-reduced-motion: reduce)");
  const sync = () => setReduced(query.matches);
  query.addEventListener("change", sync);
  return () => query.removeEventListener("change", sync);
 }, []);
 const [keyboard, setKeyboard] = useState(false);
 const still = Boolean(reduced) || keyboard;
 const transition = { duration: still ? 0 : 0.18, ease: EASE };
 const fade = { initial: { opacity: still ? 1 : 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: still ? 0 : 0.1 } };
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
 const begin = () => { setSavedAccess(access); setSavedRecipients(recipients); setBytes(0); setStage("preparing"); setPlaying(true); setCopied(false); if (take !== "sheet") setSheet(false); };
 const retry = () => { setStage("uploading"); setPlaying(true); };
 const copy = async () => {
  try { await navigator.clipboard.writeText("https://spool.page/s/demo-cart"); setCopied(true); setCopyProblem(false); }
  catch { setCopyProblem(true); }
 };
 const progress = <div className="sp-progress" aria-live="polite">
  <div className="sp-between"><strong>{status[stage]}</strong><span className="sp-mono">{stage === "uploading" ? `${Math.floor(bytes / 18.6 * 100)}%` : stage === "failed" ? "paused" : ""}</span></div>
  {stage === "uploading" || stage === "failed" ? <>
   <div className="sp-meter" role="progressbar" aria-label="Bytes uploaded" aria-valuemin={0} aria-valuemax={18.6} aria-valuenow={bytes}><span style={{ transform: `scaleX(${bytes / 18.6})` }} /></div>
   <div className="sp-between sp-muted sp-mono"><span>{bytes.toFixed(1)} / 18.6 mb</span><span>{stage === "failed" ? "connection lost" : "upload"}</span></div>
  </> : <p className="sp-muted">{stage === "preparing" ? "Preparing cart and its connected frames." : "Upload complete. Checking the link before it opens."}</p>}
  <div className="sp-steps"><span data-current={stage === "preparing"}>prepare</span><span data-current={stage === "uploading" || stage === "failed"}>upload</span><span data-current={stage === "finishing"}>ready</span></div>
 </div>;
 const result = <>
  <div className="sp-between"><strong>{updating ? "Link updated" : "Your link is ready"}</strong><span className="sp-mono sp-muted">{savedAccess === "public" ? "public link" : "invite only"}</span></div>
  <input className="sp-link" aria-label="Demo share link" readOnly value="https://spool.page/s/demo-cart" onFocus={(event) => event.target.select()} />
  <div className="sp-between"><span className="sp-muted">{savedAccess === "public" ? "Anyone with the link can open it." : `${savedRecipients.length} people have access.`}</span><button type="button" className="sp-primary" onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</button></div>
  <p className="sp-muted">{savedAccess === "public" ? "No sign-in required." : "Send them the link. Invitation emails haven’t been sent."}</p><button type="button" className="sp-text" onClick={() => { setAccess(savedAccess); setRecipients(savedRecipients); setEditingAccess(true); setSheet(true); }}>Manage access</button>
  {copyProblem && <p role="alert">Select the link above and copy it manually.</p>}
 </>;
 const job = <>
  <div className="sp-between sp-job-title"><span className="sp-mono">cart <span className="sp-muted">· 2 frames in journey</span></span>{!sheet && <button type="button" className="sp-text" onClick={() => setSheet(true)}>Details</button>}</div>
  {stage === "ready" ? result : stage === "changed" ? <>
   <strong>Your edits are still local.</strong><p className="sp-muted">Update the same link when you’re ready.</p>
   <button type="button" className="sp-primary" onClick={begin}>Update link</button>
  </> : <>{progress}{stage === "failed" ? <div className="sp-between"><span className="sp-muted">Retry this upload.</span><button type="button" className="sp-primary" onClick={retry}>Retry</button></div> : <p className="sp-muted">{updating ? "The previous version stays available." : "Keep working. Sharing continues in the background."}</p>}</>}
 </>;
 return <div className="sp-prototype" data-still={still} onPointerDownCapture={() => setKeyboard(false)} onKeyDownCapture={() => setKeyboard(true)}>
  <ShareCanvas shared={false} menu={menu ? <ShareMenu at={{ x: 470, y: 220 }} onShare={() => { setMenu(false); setSheet(true); }} /> : undefined} overlay={<>
   <button type="button" className="sp-frame-status" style={{ left: 374, top: 166 }} onClick={() => setSheet(true)} onContextMenu={(event) => { event.preventDefault(); setMenu(true); }}>
    {indicator === "ring" && <svg className="sp-ring" viewBox="0 0 12 12" aria-hidden="true"><circle cx="6" cy="6" r="4" opacity=".25" /><circle cx="6" cy="6" r="4" pathLength="1" strokeDasharray={`${stage === "uploading" ? bytes / 18.6 : stage === "ready" ? 1 : .25} 1`} /></svg>}{indicator === "thread" && <span className="sp-thread-mark" aria-hidden="true"><span style={{ transform: `scaleX(${stage === "uploading" ? bytes / 18.6 : 1})` }} /></span>} {status[stage]}{stage === "uploading" ? ` · ${Math.floor(bytes / 18.6 * 100)}%` : ""}
   </button>
   <button type="button" className="sp-frame-hit" aria-label="Share cart" onContextMenu={(event) => { event.preventDefault(); setMenu(true); }} onClick={() => setSheet(true)} />
   <AnimatePresence initial={false}>{!sheet && !menu && stage !== "setup" && <motion.section key="tray" layout={!still} initial={{ opacity: 0, y: still ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: still ? 0 : 3 }} transition={transition} className={`sp-job sp-job-${take}`} aria-label="Share progress"><AnimatePresence initial={false} mode="popLayout"><motion.div key={stage} {...fade} layout={still ? false : "position"}><PresenceContents>{job}</PresenceContents></motion.div></AnimatePresence></motion.section>}</AnimatePresence>
   <AnimatePresence initial={false}>{sheet && <motion.div {...fade} className={`sp-sheet-wrap ${take === "sheet" ? "sp-centered" : ""}`}>
    <motion.section layout={!still} transition={transition} initial={{ opacity: 0, y: still ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: still ? 0 : 3 }} className="sp-sheet" aria-label="Share cart">
     <header className="sp-between"><h1>Share cart</h1><button type="button" className="sp-text" aria-label="Close sharing" onClick={() => setSheet(false)}>✕</button></header>
     <div className="sp-body">
      <p className="sp-muted">A playable journey, starting from cart.</p>
      <button type="button" className="sp-scope sp-between" onClick={() => setDetails(!details)}><span>cart → receipt</span><span className="sp-muted">2 frames {details ? "−" : "+"}</span></button>
      {details && <p className="sp-muted">Includes cart and receipt. The menu frame is outside this journey.</p>}
      <AnimatePresence initial={false} mode="popLayout"><motion.div key={stage === "setup" || editingAccess ? `access-${access}` : stage} layout={still ? false : "position"} {...fade}>
      <PresenceContents>{stage === "setup" || editingAccess ? <AccessEditor access={access} onAccess={setAccess} recipients={recipients} onRecipients={setRecipients} existing={editingAccess} onSave={(nextRecipients) => {
       if (editingAccess) { setSavedAccess(access); setSavedRecipients(nextRecipients); setEditingAccess(false); }
       else { begin(); setSavedRecipients(nextRecipients); }
      }} /> : stage === "ready" ? result : job}</PresenceContents>
      </motion.div></AnimatePresence>
     </div>
     <footer>{busy ? <button type="button" className="sp-text" onClick={() => setSheet(false)}>Continue working</button> : <span className="sp-muted">Edits stay local until you update the link.</span>}</footer>
    </motion.section>
   </motion.div>}</AnimatePresence>
  </>} />
  <div className="sp-demo"><span>prototype · simulated upload</span><span>{take === "tray" ? `B · background tray · ${indicator}` : take === "sheet" ? "A · share sheet" : "C · beside the frame"}</span><div>
   <button type="button" onClick={() => { setStage("setup"); setSheet(false); setMenu(true); setPlaying(false); }}>Right-click menu</button>
   {busy && <button type="button" onClick={() => { setPlaying(false); setStage("failed"); }}>Interrupt upload</button>}
   {stage === "ready" && <button type="button" onClick={() => { setUpdating(true); setStage("changed"); setCopied(false); }}>Simulate local edit</button>}
   <button type="button" onClick={() => { setStage("setup"); setSheet(true); setMenu(false); setPlaying(false); setUpdating(false); setEditingAccess(false); }}>Restart</button>
  </div></div>
 </div>;
}

function PresenceContents({ children }: { children: ReactNode }) {
 const present = useIsPresent();
 return <div className="contents" inert={!present} aria-hidden={!present || undefined}>{children}</div>;
}
