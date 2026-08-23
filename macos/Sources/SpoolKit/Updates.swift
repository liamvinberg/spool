import Foundation

// Is there a newer release than this one?
//
// The whole mechanism, and it is deliberately small: ask GitHub what the latest
// release is and hand back the number. Nothing downloads itself and nothing
// replaces itself. The app has no updater, it has a question it can ask.
//
// It is asked only when somebody clicks the menu item. The daemon runs its own
// daily check for the npm package and says so in the canvas; a second timer in
// the menu bar would be the same news twice from two places.

public enum SpoolUpdates {
  /// `releases/latest` and not the tag list, because it already skips drafts and
  /// prereleases. Whatever it names is something a person is meant to install.
  static let endpoint = URL(
    string: "https://api.github.com/repos/liamvinberg/spool/releases/latest"
  )!

  /// Where a person goes when the app cannot work the answer out itself.
  public static let releasesPage = URL(
    string: "https://github.com/liamvinberg/spool/releases/latest"
  )!

  public struct Release: Sendable {
    public let version: SpoolVersion
    /// The release's own page, notes and checksum included, rather than the dmg
    /// itself. What to install is worth a look before it downloads.
    public let page: URL
  }

  public enum Failure: LocalizedError, Sendable {
    case offline(String)
    case refused(Int)
    case unreadable

    public var errorDescription: String? {
      switch self {
      case .offline(let detail):
        return "Spool could not reach GitHub: \(detail)"
      case .refused(let status):
        return "GitHub answered \(status) instead of naming the latest release."
      case .unreadable:
        return "GitHub named a release this app cannot compare against its own version."
      }
    }
  }

  private struct Payload: Decodable {
    let tagName: String
    let htmlUrl: String
  }

  public static func latest(timeout: TimeInterval = 10) async throws -> Release {
    var request = URLRequest(url: endpoint)
    request.timeoutInterval = timeout
    request.setValue("application/vnd.github+json", forHTTPHeaderField: "Accept")

    let data: Data
    let response: URLResponse
    do {
      (data, response) = try await URLSession.shared.data(for: request)
    } catch {
      throw Failure.offline(error.localizedDescription)
    }

    guard let http = response as? HTTPURLResponse else {
      throw Failure.offline("no response")
    }
    guard http.statusCode == 200 else {
      throw Failure.refused(http.statusCode)
    }

    let decoder = JSONDecoder()
    decoder.keyDecodingStrategy = .convertFromSnakeCase
    guard let payload = try? decoder.decode(Payload.self, from: data),
      let version = SpoolVersion(payload.tagName),
      let page = URL(string: payload.htmlUrl)
    else {
      throw Failure.unreadable
    }

    return Release(version: version, page: page)
  }
}
