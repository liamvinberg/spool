# The flow map is read, not walked

Arrows claim what frame source says: navigation sites are parsed from the AST, edges carry `will` or `might` certainty, and playing can only verify an edge, never add or remove one (#34, superseding the v1 declared/walked law; dashed arrows are retired). A `ui.go` whose destination cannot be read statically is flagged by `spool flows`, never drawn and never simulated: the gap is named, not papered over.
