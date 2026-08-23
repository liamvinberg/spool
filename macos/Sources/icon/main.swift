import AppKit
import SpoolKit

// Draws the application icon into an .iconset directory, which iconutil turns
// into Resources/AppIcon.icns. See scripts/icon.sh, which is the only thing that
// should run this.
//
// The mark comes from spoolMarkPath, the same geometry the menu bar draws, so
// the icon in Finder and the glyph in the bar can never drift apart. The colours
// are the canvas's own, --color-bg and --color-thread from src/ui/ui.css,
// spelled out here because a Swift target has no stylesheet to read a token
// from. If either moves there, move it here too.

let ground = NSColor(srgbRed: 0x0e / 255, green: 0x0e / 255, blue: 0x0e / 255, alpha: 1)
let thread = NSColor(srgbRed: 0xf5 / 255, green: 0x39 / 255, blue: 0x1a / 255, alpha: 1)

/// Apple's icon grid, as ratios of the canvas. On the 1024 canvas the rounded
/// square is 824 wide, centred, with a corner radius of 185.4. Every size below
/// is that same shape scaled, which is what makes the icon look like it belongs
/// beside the ones Apple ships rather than a square someone pasted in.
let squircleInset = 100.0 / 1024.0
let squircleRadius = 185.4 / 824.0

/// How much of the rounded square the ribbon fills. It is an open, airy shape,
/// so it carries a larger box than a solid glyph would.
let markShare = 0.68

let entries: [(name: String, pixels: Int)] = [
  ("icon_16x16", 16),
  ("icon_16x16@2x", 32),
  ("icon_32x32", 32),
  ("icon_32x32@2x", 64),
  ("icon_128x128", 128),
  ("icon_128x128@2x", 256),
  ("icon_256x256", 256),
  ("icon_256x256@2x", 512),
  ("icon_512x512", 512),
  ("icon_512x512@2x", 1024),
]

func render(pixels: Int) -> Data? {
  let side = CGFloat(pixels)
  let image = NSImage(size: NSSize(width: side, height: side))

  image.lockFocus()
  NSGraphicsContext.current?.imageInterpolation = .high

  let inset = side * squircleInset
  let plate = NSRect(x: inset, y: inset, width: side - inset * 2, height: side - inset * 2)
  let radius = plate.width * squircleRadius
  ground.setFill()
  NSBezierPath(roundedRect: plate, xRadius: radius, yRadius: radius).fill()

  if let context = NSGraphicsContext.current?.cgContext {
    let box = plate.insetBy(
      dx: plate.width * (1 - markShare) / 2,
      dy: plate.height * (1 - markShare) / 2
    )
    if let path = try? spoolMarkPath(fitting: box) {
      context.addPath(path)
      context.setFillColor(thread.cgColor)
      context.fillPath(using: .evenOdd)
    }
  }

  image.unlockFocus()

  guard let tiff = image.tiffRepresentation,
    let rep = NSBitmapImageRep(data: tiff)
  else { return nil }
  return rep.representation(using: .png, properties: [:])
}

let directory = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "./AppIcon.iconset"
try FileManager.default.createDirectory(atPath: directory, withIntermediateDirectories: true)

for entry in entries {
  guard let png = render(pixels: entry.pixels) else {
    FileHandle.standardError.write(Data("could not encode \(entry.name)\n".utf8))
    exit(1)
  }
  try png.write(to: URL(fileURLWithPath: "\(directory)/\(entry.name).png"))
}

print(directory)
