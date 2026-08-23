import CoreGraphics
import Testing

@testable import SpoolKit

@Suite("the mark")
struct MarkTests {
  @Test("reads every segment of the exported path")
  func parses() throws {
    let path = try spoolMarkPath()
    #expect(!path.isEmpty)

    // What the export in src/brand.ts holds: nine subpaths, twelve linetos and
    // a hundred and one curves. Counted rather than described, because the
    // reader takes M, L and C with implicit repetition and a bug in the
    // repetition would quietly drop segments rather than throw. Nine matters
    // most: the ribbon is nine separate strokes, and a mark with eight is a
    // different logo.
    var moves = 0
    var lines = 0
    var curves = 0
    path.applyWithBlock { element in
      switch element.pointee.type {
      case .moveToPoint: moves += 1
      case .addLineToPoint: lines += 1
      case .addCurveToPoint: curves += 1
      default: break
      }
    }
    #expect(moves == 9)
    #expect(lines == 12)
    #expect(curves == 101)
  }

  @Test("lands inside the identity's own viewBox")
  func bounds() throws {
    // The artwork is drawn for viewBox "250 182 524 660". Geometry that spills
    // out of it is geometry that got scaled or flipped by mistake.
    let bounds = try spoolMarkPath().boundingBoxOfPath
    #expect(spoolMarkViewBox.insetBy(dx: -1, dy: -1).contains(bounds))
    #expect(bounds.width > spoolMarkViewBox.width * 0.9)
    #expect(bounds.height > spoolMarkViewBox.height * 0.9)
  }

  @Test("fits a square without squashing")
  func fits() throws {
    let square = CGRect(x: 0, y: 0, width: 100, height: 100)
    let bounds = try spoolMarkPath(fitting: square).boundingBoxOfPath

    // Aspect kept: the viewBox is taller than it is wide, so a fitted mark fills
    // the height and leaves air at the sides.
    #expect(abs(bounds.midX - square.midX) < 1)
    #expect(abs(bounds.midY - square.midY) < 1)
    #expect(bounds.height > 95 && bounds.height <= 100.5)
    #expect(bounds.width < 85)
  }

  @Test("refuses a command it cannot draw")
  func refuses() {
    #expect(throws: MarkPathError.self) {
      _ = try PathReader("M 0 0 A 1 1 0 0 1 2 2").path()
    }
  }
}
