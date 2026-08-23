import AppKit

// The spool ribbon, from the SVG path in src/brand.ts to something AppKit can
// draw.
//
// The alternative was to trace the ribbon by hand into bezier calls, which is
// what the model app does with a six-segment mark. This one is 340 segments of
// exported artwork, so the string is copied whole by scripts/mark.sh and read
// here instead. The reader below is not a general SVG parser and does not try to
// be: it takes the moveto, lineto and curveto commands in absolute form, which
// is everything the export uses, and refuses anything else rather than guessing
// at it. A mark that silently loses a segment is worse than one that fails to
// build.

/// What went wrong reading the path, as far as anyone needs to know.
public enum MarkPathError: Error, CustomStringConvertible {
  case unsupportedCommand(Character)
  case truncated

  public var description: String {
    switch self {
    case .unsupportedCommand(let command):
      return "the mark uses an SVG command this reader does not take: \(command)"
    case .truncated:
      return "the mark ends mid-command"
    }
  }
}

/// The ribbon in the identity's own coordinates, y still growing downward.
public func spoolMarkPath() throws -> CGPath {
  return try PathReader(spoolMarkPathData).path()
}

/// The ribbon scaled to fit `rect` and centred in it, y flipped for AppKit.
/// Aspect is kept: a squashed logo is not the logo.
public func spoolMarkPath(fitting rect: CGRect) throws -> CGPath {
  let box = spoolMarkViewBox
  let scale = min(rect.width / box.width, rect.height / box.height)
  var transform = CGAffineTransform.identity
    .translatedBy(x: rect.midX, y: rect.midY)
    .scaledBy(x: scale, y: -scale)
    .translatedBy(x: -box.midX, y: -box.midY)
  guard let fitted = try spoolMarkPath().copy(using: &transform) else {
    throw MarkPathError.truncated
  }
  return fitted
}

/// The menu bar glyph. A template image, so the bar tints it itself: black on a
/// light bar, white on a dark one, and right in whatever appearance comes next.
/// The mark is never the red one here; a status item that keeps its own colour
/// is the mark of an app that does not belong in the bar.
@MainActor
public func spoolMarkImage(edge: CGFloat) -> NSImage {
  let size = NSSize(width: edge, height: edge)
  let image = NSImage(size: size, flipped: false) { rect in
    guard let path = try? spoolMarkPath(fitting: rect),
      let context = NSGraphicsContext.current?.cgContext
    else { return false }
    context.addPath(path)
    context.setFillColor(NSColor.black.cgColor)
    // The export overlaps its own subpaths, and the identity fills them
    // fill-rule="evenodd". Winding here would flood the gaps in the ribbon.
    context.fillPath(using: .evenOdd)
    return true
  }
  image.isTemplate = true
  return image
}

// MARK: - The reader

/// Absolute moveto, lineto and curveto, with implicit repetition: `L a b c d` is
/// two linetos, and coordinate pairs after a `C` are more curves. That is how
/// the export is written and the whole of what this takes.
/// Internal rather than private so the tests can hand it a command it must refuse.
struct PathReader {
  private let scanner: Scanner

  init(_ data: String) {
    scanner = Scanner(string: data)
    scanner.charactersToBeSkipped = CharacterSet(charactersIn: " ,\n\t\r")
  }

  func path() throws -> CGPath {
    let path = CGMutablePath()
    var command: Character?
    var start = CGPoint.zero
    var current = CGPoint.zero

    while !scanner.isAtEnd {
      if let letter = scanLetter() {
        command = letter
        if letter == "Z" || letter == "z" {
          path.closeSubpath()
          current = start
          continue
        }
      }
      guard let command else { throw MarkPathError.truncated }

      switch command {
      case "M":
        current = try point()
        start = current
        path.move(to: current)
      case "L":
        current = try point()
        path.addLine(to: current)
      case "C":
        let one = try point()
        let two = try point()
        current = try point()
        path.addCurve(to: current, control1: one, control2: two)
      default:
        throw MarkPathError.unsupportedCommand(command)
      }
    }

    return path.copy() ?? path
  }

  /// A command letter, or nothing when the next token is another coordinate for
  /// the command already running.
  private func scanLetter() -> Character? {
    let position = scanner.currentIndex
    guard let scanned = scanner.scanCharacter() else { return nil }
    if scanned.isLetter { return scanned }
    scanner.currentIndex = position
    return nil
  }

  private func point() throws -> CGPoint {
    guard let x = scanner.scanDouble(), let y = scanner.scanDouble() else {
      throw MarkPathError.truncated
    }
    return CGPoint(x: x, y: y)
  }
}
