import { useState } from "react";

export type Access = "invited" | "public";
const mailbox = /^[^\s@]+@[^\s@]+\.[^\s@]+$/u;
export function AccessEditor({ access, onAccess, recipients, onRecipients, onSave, existing }: {
 access: Access; onAccess: (value: Access) => void; recipients: string[]; onRecipients: (value: string[]) => void; onSave: (recipients: string[]) => void; existing: boolean;
}) {
 const [draft, setDraft] = useState("");
 const [problem, setProblem] = useState("");
 const add = () => {
  const addresses = draft.split(/[\s,;]+/u).filter(Boolean).map(value => value.toLowerCase());
  if (addresses.length === 0) return recipients;
  const invalid = addresses.find(value => !mailbox.test(value));
  if (invalid) { setProblem(`Check this address: ${invalid}`); return undefined; }
  const next = [...new Set([...recipients, ...addresses])];
  onRecipients(next); setDraft(""); setProblem(""); return next;
 };
 return <div className="sp-access">
  <label htmlFor="sp-access">Who can open this link?</label>
  <select id="sp-access" value={access} onChange={event => { onAccess(event.target.value === "public" ? "public" : "invited"); setProblem(""); }}>
   <option value="invited">Only invited people</option><option value="public">Anyone with the link</option>
  </select>
  {access === "invited" ? <>
   <div className="sp-recipients" aria-label="Invited people">{recipients.map(email => <span className="sp-recipient" key={email}>{email}<button type="button" aria-label={`Remove ${email}`} onClick={() => onRecipients(recipients.filter(value => value !== email))}>×</button></span>)}</div>
   <div className="sp-address"><input aria-label="Email addresses" placeholder="Add email addresses" value={draft} onChange={event => { setDraft(event.target.value); setProblem(""); }} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); add(); } }} /><button type="button" className="sp-text" onClick={add}>Add</button></div>
   <p className="sp-muted">Paste several addresses, separated by commas. They’ll sign in to open the link.</p>
  </> : <p className="sp-public-note">Anyone who receives or forwards this link can open it. No sign-in required.</p>}
  {problem && <p role="alert" className="sp-error">{problem}</p>}
  <button type="button" className="sp-primary sp-full" onClick={() => {
   const next = access === "invited" ? add() : recipients;
   if (next === undefined) return;
   if (access === "invited" && next.length === 0) { setProblem("Add at least one email address."); return; }
   onSave(next);
  }}>{existing ? "Save access" : "Create link"}</button>
  <p className="sp-muted">{existing ? "Access changes keep the same link." : "You’ll copy and send the link once it’s ready."}</p>
 </div>;
}
