import Foundation
import SpoolKit

// A line per thing the app does, in the state directory beside the daemon's own
// log. A menu bar app has no console: without this, "it did not open my canvas"
// has nowhere to be answered from.
//
// Never the control token, and never a project path. The token is a credential
// and a path is somebody's work. Pids, ports, versions and verdicts only.

@MainActor
enum AppLog {
  private static let file = SpoolDaemon.stateDirectory().appendingPathComponent("app.log")

  static func write(_ fields: String...) {
    let stamp = ISO8601DateFormatter().string(from: Date())
    let line = ([stamp] + fields).joined(separator: "\t") + "\n"
    guard let data = line.data(using: .utf8) else { return }
    try? FileManager.default.createDirectory(
      at: file.deletingLastPathComponent(), withIntermediateDirectories: true)
    if let handle = try? FileHandle(forWritingTo: file) {
      defer { try? handle.close() }
      _ = try? handle.seekToEnd()
      try? handle.write(contentsOf: data)
    } else {
      try? data.write(to: file)
    }
  }
}
