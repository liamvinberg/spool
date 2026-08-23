import Foundation

// The Node runtime and the spool CLI that ship inside the bundle.
//
// The point of the app is that nobody has to install Node or run npm, so both
// are fetched at build time by scripts/bundle-runtime.sh and laid out here:
//
//   Spool.app/Contents/Resources/runtime/bin/node
//   Spool.app/Contents/Resources/runtime/cli/node_modules/spool.page/dist/cli.js
//   Spool.app/Contents/Resources/runtime/RUNTIME.txt
//
// The npm artifact is the published `spool.page` of this app's own version, so
// an installed app and `npx spool.page` are the same program. RUNTIME.txt
// records the exact Node build and spool version that went in, because "which
// Node is in there" is a question a bug report will ask.

public struct SpoolRuntime: Sendable {
  public let node: URL
  public let cli: URL

  public init(node: URL, cli: URL) {
    self.node = node
    self.cli = cli
  }

  /// The runtime under a directory laid out the way the bundle lays it out.
  public static func at(_ root: URL) -> SpoolRuntime? {
    let node = root.appendingPathComponent("bin/node")
    let cli = root.appendingPathComponent("cli/node_modules/spool.page/dist/cli.js")
    let manager = FileManager.default
    guard manager.isExecutableFile(atPath: node.path), manager.fileExists(atPath: cli.path) else {
      return nil
    }
    return SpoolRuntime(node: node, cli: cli)
  }

  /// The one inside this app bundle. Absent in a `swift run` of a development
  /// CLI, which has no bundle around it, so callers say what to do about that
  /// rather than being handed a path that is not there.
  public static func bundled() -> SpoolRuntime? {
    guard let resources = Bundle.main.resourceURL else { return nil }
    return at(resources.appendingPathComponent("runtime"))
  }
}
