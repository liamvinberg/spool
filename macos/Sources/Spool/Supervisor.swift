import AppKit
import SpoolKit

// Who owns the daemon.
//
// First supervisor wins, which is the rule the CLI already plays by from its
// side. On launch this asks the shared state directory whether a daemon is
// answering. One that is gets adopted exactly as it is: not restarted, not
// upgraded, not reported as a conflict. Only when nothing answers does the
// bundled daemon start.
//
// The consequence is the whole point of the app. A developer who was already
// running `spool` in a terminal loses nothing by installing this. A designer who
// installs this and never opens a terminal gets a daemon anyway.
//
// Ownership is what quit is decided on. A daemon this app started is stopped
// when it quits; an adopted one is left running, because something else is
// keeping it and quitting a menu bar app is not a request to end somebody's
// session. The pid is checked again at quit rather than trusted from launch: if
// `spool upgrade` restarted the daemon in between, the thing running is no
// longer the thing this app started, and stopping it would be a stranger killing
// a process.

@MainActor
final class Supervisor {
  static let shared = Supervisor()

  let directory = SpoolDaemon.stateDirectory()

  /// The daemon this app started, if it started one.
  private var startedPid: Int32?

  /// Adopt whatever is running, or start the bundled daemon. Called once, at
  /// launch, so that clicking the menu is never the first time a canvas exists.
  func adoptOrStart() async {
    switch await SpoolDaemon.status(in: directory) {
    case .running(let url, let pid, let version):
      AppLog.write("boot", "adopted", "pid=\(pid)", "v\(version)", url.absoluteString)
    case .stopped:
      await startBundled(announcing: true)
    }
  }

  /// The canvas to open, starting a daemon if the adopted one has since gone.
  /// Nothing is cached: `spool stop` in a terminal is a thing that happens, and
  /// a menu item that opens a dead port is worse than one that takes a moment.
  func canvas() async -> URL? {
    if case .running(let url, _, _) = await SpoolDaemon.status(in: directory) { return url }
    await startBundled(announcing: true)
    if case .running(let url, _, _) = await SpoolDaemon.status(in: directory) { return url }
    return nil
  }

  /// Stop the daemon only if it is still the one this app started.
  func shutdown() async {
    guard let startedPid else {
      AppLog.write("quit", "left the daemon running")
      return
    }
    guard case .running(_, let pid, _) = await SpoolDaemon.status(in: directory), pid == startedPid
    else {
      AppLog.write("quit", "the daemon it started is already gone")
      return
    }
    do {
      try await SpoolDaemon.stop(pid: pid)
      AppLog.write("quit", "stopped", "pid=\(pid)")
    } catch {
      AppLog.write("quit", "FAIL", Alerts.short(error))
    }
  }

  private func startBundled(announcing: Bool) async {
    guard let runtime = SpoolRuntime.bundled() else {
      AppLog.write("start", "FAIL", "no bundled runtime")
      if announcing {
        Alerts.tell(
          "This copy of Spool has no daemon in it.",
          """
          The app bundles Node and the spool package, and neither is where it \
          should be. Download Spool again from the releases page.
          """,
          style: .critical
        )
      }
      return
    }

    do {
      let status = try await SpoolDaemon.start(runtime: runtime, in: directory)
      if case .running(let url, let pid, let version) = status {
        startedPid = pid
        AppLog.write("start", "OK", "pid=\(pid)", "v\(version)", url.absoluteString)
      }
    } catch {
      AppLog.write("start", "FAIL", Alerts.short(error))
      if announcing {
        Alerts.tell(
          "Spool could not start its daemon.",
          "\(Alerts.short(error))",
          style: .critical
        )
      }
    }
  }
}
