import AppKit
import SpoolKit

// Check for updates, the menu item.
//
// It asks GitHub for the latest release, compares it to the number in this
// bundle, and says one of three things. It does not download anything and it
// does not replace anything: the answer is a sentence and a link to the release
// page, where the notes and the checksum are. No Sparkle, no in-place update.
//
// Nothing here runs on its own. The daemon already runs a daily check for the
// npm package and says so in the canvas; a second timer in the menu bar would be
// the same news twice from two places.

@MainActor
enum Updates {
  /// The number this bundle was built with. scripts/build.sh stamps it from the
  /// repo's package.json, which is the version changesets picked and the version
  /// of the spool package inside the bundle. One number for all of it.
  static var installed: SpoolVersion? {
    guard let text = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String else {
      return nil
    }
    return SpoolVersion(text)
  }

  /// One check at a time. Two panels stacked behind each other is a worse answer
  /// than a menu item that ignores the second click.
  private static var checking = false

  static func check() {
    guard !checking else { return }
    checking = true
    Task {
      await run()
      checking = false
    }
  }

  private static func run() async {
    guard let installed else {
      AppLog.write("updates", "FAIL", "no version in bundle")
      Alerts.tell(
        "Spool cannot tell which version it is.",
        """
        This copy has no version number in it, which usually means it was not \
        built by scripts/build.sh. Compare it against the releases page yourself.
        """,
        style: .warning
      )
      return
    }

    let latest: SpoolUpdates.Release
    do {
      latest = try await SpoolUpdates.latest()
    } catch {
      AppLog.write("updates", "FAIL", Alerts.short(error))
      Alerts.tell(
        "Spool could not check for updates.",
        "\(error.localizedDescription)\n\nYou have \(installed).",
        style: .warning
      )
      return
    }

    AppLog.write("updates", "OK", "installed=\(installed)", "latest=\(latest.version)")

    // Not `!=`: a local build ahead of the published release is every machine
    // that ever builds this app, and offering it a downgrade would be nonsense.
    guard latest.version > installed else {
      Alerts.tell(
        "Spool is up to date.",
        "You have \(installed), which is the latest release.",
        style: .informational
      )
      return
    }

    offer(latest, installed: installed)
  }

  private static func offer(_ latest: SpoolUpdates.Release, installed: SpoolVersion) {
    let alert = NSAlert()
    alert.alertStyle = .informational
    alert.messageText = "Spool \(latest.version) is available."
    alert.informativeText = """
      You have \(installed). The release page has the download and the checksum \
      to check it against.

      Updating means replacing Spool in your Applications folder, so quit this \
      copy first.
      """
    alert.addButton(withTitle: "Open Release Page")
    alert.addButton(withTitle: "Later")

    if Alerts.run(alert) == .alertFirstButtonReturn {
      NSWorkspace.shared.open(latest.page)
    }
  }
}
