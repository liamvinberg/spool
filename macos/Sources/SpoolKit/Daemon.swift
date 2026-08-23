import Foundation

// The daemon, as seen from outside it.
//
// This is a port of what src/daemon/lifecycle.ts does from the CLI's side, and
// it has to stay a port: the app and the CLI share one state directory and one
// daemon, and two programs that disagree about which daemon is running would
// both start one. So the rules are copied rather than reinvented.
//
//   - `~/.spool` unless SPOOL_DIR says otherwise. daemon.json inside it records
//     the pid, host and port of what runs.
//   - The state file alone proves nothing and a pid can be reused, so liveness
//     is health over HTTP: /api/health has to answer, say it is spool, and name
//     the same pid the file does.
//   - First supervisor wins. A daemon that is already up is adopted whoever
//     started it; a bundled one starts only when nothing answers.
//
// The control token in daemon.json is a credential. It is read because the file
// is read whole, and it is never logged, shown, or passed anywhere: this app has
// no reason to make a control request. If that ever changes, it changes with a
// good reason attached.
//
// One thing the CLI does that this does not: sweep. `statusDaemon` deletes a
// daemon.json whose daemon no longer answers, and getting that right is delicate
// — a health probe gives up after a second, so a busy daemon can read as dead,
// and deleting a live daemon's token strands it, because only that daemon ever
// knew it. This app never needs to delete the file, so it does not, and the
// whole class of mistake is out of reach. A health probe that comes back empty
// when a daemon is in fact alive costs a start attempt that stands down on its
// own; it costs nobody their credential.

public struct DaemonState: Sendable {
  public let pid: Int32
  public let host: String
  public let port: Int
  public let version: String
  public let startedAt: String
}

public struct DaemonHealth: Sendable {
  public let version: String
  public let pid: Int32
  public let startedAt: String
}

public enum DaemonStatus: Sendable {
  case running(url: URL, pid: Int32, version: String)
  case stopped
}

public enum SpoolDaemonError: LocalizedError {
  case noRuntime(URL)
  case didNotStart(log: URL)
  case didNotStop(pid: Int32)

  public var errorDescription: String? {
    switch self {
    case .noRuntime(let url):
      return "This copy of Spool has no bundled daemon at \(url.path)."
    case .didNotStart(let log):
      return "The Spool daemon did not come up. \(log.path) says why."
    case .didNotStop(let pid):
      return "The Spool daemon (pid \(pid)) did not exit."
    }
  }
}

public enum SpoolDaemon {
  // MARK: - Where the state lives

  /// `~/.spool` unless SPOOL_DIR says otherwise, which is how a checkout rides
  /// its own daemon beside the daily one.
  public static func stateDirectory(
    environment: [String: String] = ProcessInfo.processInfo.environment
  ) -> URL {
    if let override = environment["SPOOL_DIR"], !override.isEmpty {
      return URL(fileURLWithPath: (override as NSString).expandingTildeInPath).standardizedFileURL
    }
    return FileManager.default.homeDirectoryForCurrentUser.appendingPathComponent(".spool")
  }

  public static func logFile(in directory: URL) -> URL {
    directory.appendingPathComponent("daemon.log")
  }

  /// Machine-written ephemera: corrupt or unreadable state reads as absent.
  public static func readState(in directory: URL) -> DaemonState? {
    let file = directory.appendingPathComponent("daemon.json")
    guard let data = try? Data(contentsOf: file),
      let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      let pid = parsed["pid"] as? Int,
      let host = parsed["host"] as? String,
      let port = parsed["port"] as? Int,
      let version = parsed["version"] as? String,
      let startedAt = parsed["startedAt"] as? String,
      let token = parsed["controlToken"] as? String,
      !token.isEmpty
    else {
      return nil
    }
    return DaemonState(
      pid: Int32(pid), host: host, port: port, version: version, startedAt: startedAt)
  }

  // MARK: - Where it answers

  /// A bind-everything host is not a dialable address.
  public static func connectHost(_ host: String) -> String {
    switch host {
    case "0.0.0.0": return "127.0.0.1"
    case "::", "::0": return "::1"
    default: return host
    }
  }

  public static func url(host: String, port: Int) -> URL? {
    let dialable = connectHost(host)
    let authority = dialable.contains(":") ? "[\(dialable)]" : dialable
    return URL(string: "http://\(authority):\(port)")
  }

  /// What the daemon at this URL says it is, asked without a control token.
  public static func health(at url: URL, timeout: TimeInterval = 1) async -> DaemonHealth? {
    var request = URLRequest(url: url.appendingPathComponent("api/health"))
    request.timeoutInterval = timeout
    guard let (data, response) = try? await URLSession.shared.data(for: request),
      let http = response as? HTTPURLResponse, http.statusCode == 200,
      let parsed = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
      parsed["name"] as? String == "spool",
      let version = parsed["version"] as? String,
      let pid = parsed["pid"] as? Int,
      let startedAt = parsed["startedAt"] as? String
    else {
      return nil
    }
    return DaemonHealth(version: version, pid: Int32(pid), startedAt: startedAt)
  }

  /// The daemon recorded in state, but only if it answers health as itself.
  public static func status(in directory: URL) async -> DaemonStatus {
    guard let state = readState(in: directory),
      let url = url(host: state.host, port: state.port),
      let health = await health(at: url),
      health.pid == state.pid
    else {
      return .stopped
    }
    return .running(url: url, pid: state.pid, version: health.version)
  }

  // MARK: - Starting and stopping

  /// Start the bundled daemon and wait until it reports healthy. The caller has
  /// already found nothing running: this never adopts, because a caller that
  /// wants adoption calls `status` first and knows whether it owns what it got.
  @discardableResult
  public static func start(
    runtime: SpoolRuntime,
    in directory: URL,
    environment: [String: String] = ProcessInfo.processInfo.environment,
    timeout: TimeInterval = 30
  ) async throws -> DaemonStatus {
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let log = logFile(in: directory)
    if !FileManager.default.fileExists(atPath: log.path) {
      FileManager.default.createFile(atPath: log.path, contents: nil)
    }
    let handle = try FileHandle(forWritingTo: log)
    try handle.seekToEnd()

    let process = Process()
    process.executableURL = runtime.node
    process.arguments = [runtime.cli.path, "serve", "--foreground"]
    process.standardOutput = handle
    process.standardError = handle
    // Home rather than wherever the app happened to be launched from. `serve`
    // resolves nothing from the working directory, and a daemon holding a
    // directory open is a directory that cannot be ejected.
    process.currentDirectoryURL = FileManager.default.homeDirectoryForCurrentUser
    // SPOOL_DIR and SPOOL_PORT ride along when they are set, so a lane's app
    // serves that lane. Everything else the daemon needs it reads from
    // config.json, the same as when the CLI starts it.
    process.environment = environment
    try process.run()
    try? handle.close()

    if let status = await poll(timeout: timeout, { await ready(in: directory) }) {
      return status
    }
    // Whatever it printed is in the log, which is the only place worth pointing
    // at: this app has no console.
    process.terminate()
    throw SpoolDaemonError.didNotStart(log: log)
  }

  /// Stop a daemon by pid, politely. SIGTERM is what the CLI sends and what the
  /// daemon's own shutdown listens for; nothing here escalates to SIGKILL,
  /// because a daemon mid-write is worse than a daemon still running.
  public static func stop(pid: Int32, timeout: TimeInterval = 5) async throws {
    guard kill(pid, SIGTERM) == 0 else { return }
    if await poll(timeout: timeout, { alive(pid) ? nil : true }) != nil { return }
    throw SpoolDaemonError.didNotStop(pid: pid)
  }

  public static func alive(_ pid: Int32) -> Bool {
    kill(pid, 0) == 0 || errno == EPERM
  }

  private static func ready(in directory: URL) async -> DaemonStatus? {
    let current = await status(in: directory)
    if case .running = current { return current }
    return nil
  }

  /// Probe every step until the probe yields a value or the deadline passes.
  static func poll<T: Sendable>(
    timeout: TimeInterval,
    step: TimeInterval = 0.1,
    _ probe: () async -> T?
  ) async -> T? {
    let deadline = Date().addingTimeInterval(timeout)
    while Date() < deadline {
      if let value = await probe() { return value }
      try? await Task.sleep(for: .seconds(step))
    }
    return nil
  }
}
