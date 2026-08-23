import AppKit
import SpoolKit

// The daemon lifecycle from a terminal, for checking it.
//
// A development CLI, not shipped in the bundle. The menu bar app needs a window
// server to exist at all, which makes "does it adopt a running daemon rather
// than starting a second one" a question nobody can answer over ssh. This runs
// the same SpoolKit calls the app runs, so the answer here is the answer there.
//
//   swift run spoolctl status
//   swift run spoolctl adopt-or-start ~/Applications/Spool.app/Contents/Resources/runtime
//   swift run spoolctl stop
//   swift run spoolctl mark /tmp/mark.png
//
// SPOOL_DIR and SPOOL_PORT are read exactly as the app reads them.

func fail(_ message: String) -> Never {
  FileHandle.standardError.write(Data("\(message)\n".utf8))
  exit(1)
}

func runtime(_ path: String?) -> SpoolRuntime {
  guard let path else { fail("usage: spoolctl <verb> <path to Resources/runtime>") }
  guard let runtime = SpoolRuntime.at(URL(fileURLWithPath: path)) else {
    fail("no bin/node and cli/node_modules/spool.page/dist/cli.js under \(path)")
  }
  return runtime
}

func describe(_ status: DaemonStatus) -> String {
  switch status {
  case .running(let url, let pid, let version):
    return "running \(url.absoluteString) pid=\(pid) v\(version)"
  case .stopped:
    return "stopped"
  }
}

let arguments = Array(CommandLine.arguments.dropFirst())
let verb = arguments.first ?? "status"
let directory = SpoolDaemon.stateDirectory()

switch verb {
case "status":
  print("\(directory.path): \(describe(await SpoolDaemon.status(in: directory)))")

case "start":
  if case .running = await SpoolDaemon.status(in: directory) {
    fail("a daemon is already running; `adopt-or-start` is the app's rule")
  }
  let status = try await SpoolDaemon.start(runtime: runtime(arguments.dropFirst().first), in: directory)
  print("started \(describe(status))")

case "adopt-or-start":
  // Exactly what Supervisor.adoptOrStart does, said out loud.
  switch await SpoolDaemon.status(in: directory) {
  case .running(let url, let pid, let version):
    print("adopted \(url.absoluteString) pid=\(pid) v\(version)")
  case .stopped:
    let started = try await SpoolDaemon.start(
      runtime: runtime(arguments.dropFirst().first), in: directory)
    print("started \(describe(started))")
  }

case "stop":
  guard case .running(_, let pid, _) = await SpoolDaemon.status(in: directory) else {
    print("stopped")
    exit(0)
  }
  try await SpoolDaemon.stop(pid: pid)
  print("stopped pid=\(pid)")

case "mark":
  // The menu bar glyph, written out so it can be looked at. Template images are
  // drawn in black; the bar is what makes them white.
  let out = arguments.dropFirst().first ?? "./mark.png"
  // Drawn and encoded on the main actor in one go: NSImage is not Sendable, so
  // only the PNG bytes cross back out. Swift 6.0 refuses the image itself as a
  // MainActor.run result; a newer toolchain lets it through, which is how this
  // compiled on one machine and not on the release runner.
  let png: Data? = await MainActor.run {
    let image = spoolMarkImage(edge: 512)
    guard let tiff = image.tiffRepresentation, let rep = NSBitmapImageRep(data: tiff) else { return nil }
    return rep.representation(using: .png, properties: [:])
  }
  guard let png else {
    fail("could not encode the mark")
  }
  try png.write(to: URL(fileURLWithPath: out))
  print(out)

default:
  fail("usage: spoolctl status | start <runtime> | adopt-or-start <runtime> | stop | mark [out.png]")
}
