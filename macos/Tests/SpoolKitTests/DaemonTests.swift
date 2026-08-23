import Foundation
import Testing

@testable import SpoolKit

// The daemon.json shape and the address rules are a port of
// src/daemon/lifecycle.ts. These are the checks that keep the port honest
// offline: nothing here starts a daemon or opens a socket.

@Suite("the daemon's state file")
struct DaemonStateTests {
  private func temporary() throws -> URL {
    let url = URL(fileURLWithPath: NSTemporaryDirectory())
      .appendingPathComponent("spool-macos-\(UUID().uuidString)")
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  private func write(_ json: String, to directory: URL) throws {
    try Data(json.utf8).write(to: directory.appendingPathComponent("daemon.json"))
  }

  @Test("reads what the daemon writes")
  func reads() throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }
    try write(
      """
      {
        "pid": 4242,
        "host": "127.0.0.1",
        "port": 7766,
        "version": "0.8.0",
        "startedAt": "2026-08-23T09:00:00.000Z",
        "controlToken": "not-a-real-token"
      }
      """, to: directory)

    let state = SpoolDaemon.readState(in: directory)
    #expect(state?.pid == 4242)
    #expect(state?.port == 7766)
    #expect(state?.version == "0.8.0")
  }

  @Test("machine-written ephemera: anything unreadable reads as absent")
  func tolerates() throws {
    let directory = try temporary()
    defer { try? FileManager.default.removeItem(at: directory) }

    #expect(SpoolDaemon.readState(in: directory) == nil)

    try write("{ not json", to: directory)
    #expect(SpoolDaemon.readState(in: directory) == nil)

    // A file missing the control token is one an older or partial writer left.
    // Half a state file is not a daemon.
    try write(
      """
      { "pid": 1, "host": "127.0.0.1", "port": 7766, "version": "0.8.0",
        "startedAt": "2026-08-23T09:00:00.000Z" }
      """, to: directory)
    #expect(SpoolDaemon.readState(in: directory) == nil)

    try write(
      """
      { "pid": 1, "host": "127.0.0.1", "port": 7766, "version": "0.8.0",
        "startedAt": "2026-08-23T09:00:00.000Z", "controlToken": "" }
      """, to: directory)
    #expect(SpoolDaemon.readState(in: directory) == nil)
  }

  @Test("SPOOL_DIR moves the whole state directory")
  func directory() {
    #expect(
      SpoolDaemon.stateDirectory(environment: ["SPOOL_DIR": "/tmp/spool-lane"]).path
        == "/tmp/spool-lane")
    // An empty value is not a choice, so it falls back the way the CLI does.
    #expect(
      SpoolDaemon.stateDirectory(environment: ["SPOOL_DIR": ""]).lastPathComponent == ".spool")
    #expect(SpoolDaemon.stateDirectory(environment: [:]).lastPathComponent == ".spool")
  }
}

@Suite("dialing the daemon")
struct DaemonAddressTests {
  @Test("a bind-everything host is not a dialable address")
  func connectHost() {
    #expect(SpoolDaemon.connectHost("0.0.0.0") == "127.0.0.1")
    #expect(SpoolDaemon.connectHost("::") == "::1")
    #expect(SpoolDaemon.connectHost("::0") == "::1")
    #expect(SpoolDaemon.connectHost("localhost") == "localhost")
  }

  @Test("ipv6 gets its brackets")
  func url() {
    #expect(SpoolDaemon.url(host: "127.0.0.1", port: 7766)?.absoluteString == "http://127.0.0.1:7766")
    #expect(SpoolDaemon.url(host: "::1", port: 7766)?.absoluteString == "http://[::1]:7766")
    #expect(SpoolDaemon.url(host: "0.0.0.0", port: 7767)?.absoluteString == "http://127.0.0.1:7767")
  }
}
