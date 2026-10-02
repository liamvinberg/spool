// The share popover and label chip, as one sheet both hosts inject: the canvas
// (Tailwind, light and dark) and the player (plain CSS, dark). Everything reads
// the shared colour tokens so each host paints it in its own theme.
export const shareStyles = `
.spool-share-chip{display:inline-flex;flex-shrink:0;align-items:center;gap:6px;height:16px;margin:0 -4px;padding:0 4px;border:0;border-radius:4px;background:transparent;color:var(--color-muted);font:400 11px/16px var(--font-mono,"Fragment Mono",ui-monospace,monospace);white-space:nowrap;cursor:pointer;transition:background-color 140ms ease-out,color 140ms ease-out}
.spool-share-chip:hover,.spool-share-chip[aria-expanded=true]{background:var(--color-surface);color:var(--color-text)}
.spool-share-chip[data-kind=shared],.spool-share-chip[data-kind=updated]{color:var(--color-text)}
.spool-share-chip[data-kind=copied],.spool-share-chip[data-kind=interrupted]{color:var(--color-thread)}
.spool-share-glyph{display:inline-flex;width:10px;height:10px;align-items:center;justify-content:center;color:var(--color-thread);flex-shrink:0}
.spool-share-dot{width:6px;height:6px;border-radius:50%;background:var(--color-thread)}
.spool-share-dot[data-hollow=true]{background:transparent;box-shadow:inset 0 0 0 1px var(--color-thread)}
.spool-share-ring{width:10px;height:10px;transform:rotate(-90deg)}
.spool-share-ring-track{stroke:var(--color-border-raised)}
.spool-share-ring-fill{stroke:currentColor;transition:stroke-dashoffset 220ms cubic-bezier(.22,.61,.36,1)}
.spool-share-check{width:10px;height:10px}
.spool-share-ring.is-spinning{animation:spool-share-spin 1.15s linear infinite}
@keyframes spool-share-spin{to{transform:rotate(270deg)}}

.spool-share-popover{position:fixed;z-index:80;width:312px;max-width:calc(100vw - 24px);box-sizing:border-box;overflow:hidden auto;border:1px solid var(--color-border-raised);border-radius:8px;background:var(--color-raised);color:var(--color-text);font:400 13px/20px var(--font-sans,"Instrument Sans Variable",system-ui,sans-serif);transform-origin:top left}
.spool-share-popover *{box-sizing:border-box}
.spool-share-popover :focus-visible{outline:2px solid var(--color-thread);outline-offset:2px}
.spool-share-popover button,.spool-share-popover a{font:inherit;color:inherit}
.spool-share-popover button{cursor:pointer}
.spool-share-popover button:disabled{cursor:default;opacity:.5}
.spool-share-body{display:flex;flex-direction:column;gap:12px;padding:14px 16px 16px}
.spool-share-body.is-manage:has(>.spool-share-footer){padding-bottom:0}
.spool-share-header{display:flex;flex-wrap:wrap;align-items:flex-start;justify-content:space-between;gap:4px 12px}
.spool-share-header>div{display:flex;min-width:0;flex-direction:column}
.spool-share-header h2{margin:0;font:500 13px/20px var(--font-sans,"Instrument Sans Variable",system-ui,sans-serif);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.spool-share-scope{align-self:flex-start;margin:0;padding:0;border:0;background:none;color:var(--color-muted)!important;font:400 11px/16px var(--font-mono,"Fragment Mono",monospace)!important;text-align:left}
.spool-share-scope:hover{color:var(--color-text)!important}
.spool-share-status{display:inline-flex;flex-shrink:0;align-items:center;gap:6px;padding-top:2px;color:var(--color-muted);font:400 11px/16px var(--font-mono,"Fragment Mono",monospace)}
.spool-share-status svg{width:8px;height:8px;transition:transform 140ms ease-out}
.spool-share-status svg[data-open=true]{transform:rotate(180deg)}
.spool-share-included{display:flex;width:100%;flex-wrap:wrap;gap:4px;padding-top:4px}
.spool-share-included code{padding:1px 6px;border-radius:4px;background:var(--color-surface);color:var(--color-muted);font:400 11px/16px var(--font-mono,"Fragment Mono",monospace)}
.spool-share-note{margin:0;color:var(--color-muted);font-size:12px;line-height:18px}
.spool-share-note code{font:400 11px/16px var(--font-mono,"Fragment Mono",monospace);color:var(--color-text)}
.spool-share-note.is-problem,.spool-share-problem>p:first-child{color:var(--color-thread)}
.spool-share-problem p{margin:0;font-size:12px;line-height:18px;color:var(--color-muted)}
.spool-share-problem ul{display:flex;flex-direction:column;gap:8px;max-height:220px;margin:6px 0 0;padding:0;overflow-y:auto;list-style:none}
.spool-share-problem li{display:flex;flex-direction:column;gap:2px;min-width:0}
.spool-share-problem li p{color:var(--color-text)}
.spool-share-problem code{overflow-wrap:anywhere;color:var(--color-muted);font:400 11px/16px var(--font-mono,"Fragment Mono",monospace)}
.spool-share-row{display:flex;align-items:center;justify-content:space-between;gap:12px}
.spool-share-row>p{flex:1;min-width:0}
.spool-share-actions{display:flex;gap:6px}
.spool-share-access{display:flex;flex-direction:column;gap:8px}
.spool-share-modes{position:relative;display:grid;grid-template-columns:1fr 1fr;margin:0;padding:2px;border:1px solid var(--color-border-raised);border-radius:6px;background:var(--color-surface)}
.spool-share-modes legend{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.spool-share-modes label{position:relative;display:flex}
.spool-share-modes input{position:absolute;inset:0;margin:0;opacity:0;cursor:pointer}
.spool-share-modes input:disabled{cursor:default}
.spool-share-modes span{display:flex;height:28px;flex:1;align-items:center;justify-content:center;border-radius:4px;color:var(--color-muted);font-size:12px;transition:background-color 140ms ease-out,color 140ms ease-out;pointer-events:none}
.spool-share-modes label:hover span{color:var(--color-text)}
.spool-share-modes input:checked+span{background:var(--color-raised);color:var(--color-text)}
.spool-share-modes input:focus-visible+span{outline:2px solid var(--color-thread);outline-offset:2px}
.spool-share-modes input:disabled+span{opacity:.5}
.spool-share-people{display:flex;min-height:32px;flex-wrap:wrap;align-items:center;gap:4px;padding:4px 6px;border:1px solid var(--color-border-raised);border-radius:6px;background:var(--color-surface);transition:border-color 140ms ease-out}
.spool-share-people:focus-within{border-color:var(--color-muted)}
.spool-share-people input:focus-visible{outline:0}
.spool-share-people[data-problem]{border-color:var(--color-thread)}
.spool-share-person{display:inline-flex;height:20px;align-items:center;gap:4px;padding:0 4px 0 6px;border-radius:4px;background:var(--color-raised);font:400 11px/16px var(--font-mono,"Fragment Mono",monospace);overflow-wrap:anywhere}
.spool-share-person button{padding:0 2px;border:0;background:none;color:var(--color-muted)!important}
.spool-share-person button:hover{color:var(--color-text)!important}
.spool-share-people input{min-width:96px;height:20px;flex:1;padding:0 4px;border:0;outline:0;background:transparent;color:var(--color-text);font:400 11px/16px var(--font-mono,"Fragment Mono",monospace)}
.spool-share-people input::placeholder{color:color-mix(in srgb,var(--color-muted) 60%,transparent)}
.spool-share-primary{height:32px;border:0;border-radius:6px;background:var(--color-thread);color:var(--color-on-thread,#fff)!important;font-size:13px;transition:transform 140ms ease-out}
.spool-share-primary:active:not(:disabled){transform:scale(.98)}
.spool-share-small{height:24px;flex-shrink:0;padding:0 10px;border:0;border-radius:4px;background:var(--color-surface);font-size:12px!important;transition:transform 140ms ease-out,background-color 140ms ease-out}
.spool-share-small:hover:not(:disabled){background:var(--color-border-raised)}
.spool-share-small.is-primary{background:var(--color-thread);color:var(--color-on-thread,#fff)!important}
.spool-share-small:active:not(:disabled){transform:scale(.97)}
.spool-share-link{position:relative;display:flex;height:32px;align-items:center;overflow:hidden;border:1px solid var(--color-border-raised);border-radius:6px;background:var(--color-surface)}
.spool-share-link input{min-width:0;height:100%;flex:1;padding:0 10px;border:0;outline:0;background:transparent;color:var(--color-text);font:400 11px/16px var(--font-mono,"Fragment Mono",monospace);text-overflow:ellipsis}
.spool-share-link[data-running] input{color:var(--color-muted)}
.spool-share-link input::placeholder{color:var(--color-muted)}
.spool-share-link button{display:flex;width:76px;height:100%;flex-shrink:0;align-items:center;justify-content:center;border:0;border-left:1px solid var(--color-border-raised);background:transparent;font-size:12px!important;transition:background-color 140ms ease-out}
.spool-share-link button:hover:not(:disabled){background:var(--color-raised)}
.spool-share-link button>span{display:inline-flex;align-items:center;gap:4px}
.spool-share-hairline{position:absolute;right:0;bottom:0;left:0;height:1px;background:var(--color-thread);transform-origin:left;opacity:0;transition:transform 220ms cubic-bezier(.22,.61,.36,1),opacity 400ms ease-out 200ms}
.spool-share-link[data-running] .spool-share-hairline{opacity:1;transition:transform 220ms cubic-bezier(.22,.61,.36,1),opacity 0ms}
.spool-share-sections{display:flex;flex-direction:column;margin:0 -16px;border-top:1px solid var(--color-border-raised)}
.spool-share-section{display:flex;height:36px;align-items:center;justify-content:space-between;padding:0 16px;border:0;background:transparent;font-size:12px!important;text-align:left}
.spool-share-section:hover:not(:disabled){background:color-mix(in srgb,var(--color-surface) 60%,transparent)}
.spool-share-drawer{overflow:hidden}
.spool-share-drawer>div{display:flex;flex-direction:column;gap:10px;padding:4px 16px 12px}
.spool-share-sections+.spool-share-footer{margin-top:-12px}
.spool-share-footer{display:flex;min-height:40px;align-items:center;margin:0 -16px;padding:0 16px;border-top:1px solid var(--color-border-raised);font-size:12px}
.spool-share-footer>div{width:100%}
.spool-share-text{margin:0;padding:0;border:0;background:none;color:var(--color-muted)!important;font-size:12px!important;text-decoration:none;transition:color 140ms ease-out}
.spool-share-text:hover{color:var(--color-text)!important}
.spool-share-text.is-stop:hover{color:var(--color-thread)!important}
@media (prefers-reduced-motion:reduce){.spool-share-chip,.spool-share-chip *,.spool-share-popover,.spool-share-popover *{animation:none!important;transition:none!important}}
`;
