# Canvas renders iframes; the player composes one document

On the canvas every frame runs in its own sandboxed iframe: isolation, crash containment, dozens live at once. The player renders the same frame components into one composed document because View Transitions cannot cross iframe boundaries in either direction, and same-document transitions with matched `view-transition-name` are native Smart Animate (#5, #13). Two render paths from one set of frame files is deliberate: iframes for isolation, one document for cinema.
