import Foundation

/// A release number, which is three plain numbers and nothing else.
///
/// Spool's version is one number for everything: the npm package, the git tag,
/// the daemon's `/api/health`, and this bundle. Changesets picks it, so nothing
/// here ever writes one; this type only compares them.
public struct SpoolVersion: Comparable, Sendable, CustomStringConvertible {
  public let major: Int
  public let minor: Int
  public let patch: Int

  /// Accepts `1.2.3` and `v1.2.3`. Anything else is refused rather than guessed
  /// at: a tag carrying a suffix, a word or a fourth field is not something this
  /// app can rank, and ranking it wrong points somebody at a downgrade.
  public init?(_ text: String) {
    var body = Substring(text)
    if body.hasPrefix("v") {
      body = body.dropFirst()
    }

    let parts = body.split(separator: ".", omittingEmptySubsequences: false)
    guard parts.count == 3,
      let major = Self.number(parts[0]),
      let minor = Self.number(parts[1]),
      let patch = Self.number(parts[2])
    else {
      return nil
    }

    self.major = major
    self.minor = minor
    self.patch = patch
  }

  /// Deliberately stricter than `Int.init`, which takes a leading sign, a plus,
  /// and digits from any script.
  private static func number(_ part: Substring) -> Int? {
    guard !part.isEmpty, part.allSatisfy({ $0.isASCII && $0.isNumber }) else { return nil }
    return Int(part)
  }

  public var description: String { "\(major).\(minor).\(patch)" }

  public static func < (lhs: Self, rhs: Self) -> Bool {
    (lhs.major, lhs.minor, lhs.patch) < (rhs.major, rhs.minor, rhs.patch)
  }
}
