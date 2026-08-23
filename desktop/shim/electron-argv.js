// Required in front of the bundled spool cli, with `-r`, whenever it runs under
// Electron's binary as node.
//
// ELECTRON_RUN_AS_NODE gives the cli a process whose argv is node's — the binary,
// the script, then the arguments — but leaves `process.versions.electron` set,
// because it is still Electron's build of node. Commander reads that one field
// and decides argv has no script path in it, so `serve --foreground` arrives as
// the command `.../cli.js`, and the daemon dies saying it does not know that
// command. `process.defaultApp` is the flag Commander then checks to mean "argv
// looks like node's after all", so setting it is not a trick: it is stating the
// thing that is true here.
//
// It rides in `-r` rather than at a call site because node strips `-r` and its
// value out of argv and keeps them in execArgv, which means anything the cli
// spawns of itself with `process.execArgv` carries the same fix without knowing
// about it.
process.defaultApp = true;
