import AppKit
import SpoolKit

// Spool, as a macOS menu bar app.
//
// It is a supervisor with a menu on it and nothing else. No window and no
// webview: the canvas is a web app and belongs in the browser somebody already
// has their tabs, extensions and devtools in. What this replaces is the terminal
// on the way there.
//
//   1. it bundles Node and the spool package, so nothing has to be installed
//   2. it starts the daemon, or adopts the one already running
//   3. Open Canvas opens the daemon's URL in the default browser
//
// A developer keeps using the CLI against the same daemon. Nothing forks.

@MainActor
final class StatusUI {
  static let shared = StatusUI()
  private var statusItem: NSStatusItem?

  func install() {
    let item = NSStatusBar.system.statusItem(withLength: NSStatusItem.squareLength)
    // The ribbon from src/brand.ts, as a template image, so the bar tints it
    // for the appearance it is in.
    item.button?.image = spoolMarkImage(edge: 17)
    item.button?.toolTip = "Spool"

    let menu = NSMenu()

    let open = menu.addItem(
      withTitle: "Open Canvas",
      action: #selector(AppActions.openCanvas),
      keyEquivalent: ""
    )
    open.target = AppActions.shared

    menu.addItem(.separator())

    // Disabled on purpose: it is a label, not a thing to click. Which version is
    // running is the first question every bug report answers, and this app has
    // no About window to put it in.
    menu.addItem(withTitle: versionLabel(), action: nil, keyEquivalent: "").isEnabled = false

    let updates = menu.addItem(
      withTitle: "Check for Updates…",
      action: #selector(AppActions.checkForUpdates),
      keyEquivalent: ""
    )
    updates.target = AppActions.shared

    menu.addItem(.separator())

    // Routed through AppActions rather than straight to terminate, because
    // quitting has to decide about the daemon first. See AppDelegate.
    let quit = menu.addItem(
      withTitle: "Quit Spool",
      action: #selector(AppActions.quit),
      keyEquivalent: "q"
    )
    quit.target = AppActions.shared

    item.menu = menu
    statusItem = item
  }

  private func versionLabel() -> String {
    guard let version = Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String else {
      return "Spool"
    }
    return "Spool \(version)"
  }
}

@MainActor
final class AppActions: NSObject {
  static let shared = AppActions()

  @objc func openCanvas() {
    Task {
      guard let url = await Supervisor.shared.canvas() else {
        AppLog.write("open", "FAIL", "no daemon")
        return
      }
      AppLog.write("open", "OK", url.absoluteString)
      NSWorkspace.shared.open(url)
    }
  }

  @objc func checkForUpdates() {
    Updates.check()
  }

  @objc func quit() {
    NSApp.terminate(nil)
  }
}

@MainActor
final class AppDelegate: NSObject, NSApplicationDelegate {
  func applicationDidFinishLaunching(_ notification: Notification) {
    StatusUI.shared.install()
    AppLog.write("boot", "pid=\(ProcessInfo.processInfo.processIdentifier)")
    Task { await Supervisor.shared.adoptOrStart() }
  }

  /// Stopping a daemon takes a signal and a wait, and AppKit will not wait on
  /// its own. `.terminateLater` is the supported way to hold the quit open;
  /// without it the app exits first and a daemon it started outlives it with
  /// nobody left who knows they own it.
  func applicationShouldTerminate(_ sender: NSApplication) -> NSApplication.TerminateReply {
    Task {
      await Supervisor.shared.shutdown()
      NSApp.reply(toApplicationShouldTerminate: true)
    }
    return .terminateLater
  }
}

let app = NSApplication.shared
// .accessory: a menu bar presence with no Dock icon and no menu bar of its own.
// LSUIElement in Info.plist says the same thing to Launch Services, and both are
// needed: the plist decides how it launches, this decides what it is once up.
app.setActivationPolicy(.accessory)
let delegate = AppDelegate()
app.delegate = delegate
app.run()
