// swift-tools-version: 6.0
import PackageDescription

// SwiftPM compiles the binaries; scripts/build.sh assembles the .app around
// them. SwiftPM has no notion of an application bundle, and this app is mostly
// bundle: an Info.plist that keeps it out of the Dock, a Node runtime and the
// spool npm artifact under Resources. So the split is the whole story: this file
// resolves and compiles, that script makes it a Mac app.

let package = Package(
  name: "Spool",
  platforms: [.macOS(.v14)],
  targets: [
    // Everything the app and the development CLIs share: the daemon state file,
    // the health probe, the version comparison, the mark.
    .target(name: "SpoolKit"),

    // The menu bar app itself.
    .executableTarget(name: "Spool", dependencies: ["SpoolKit"]),

    // Development CLIs, not shipped in the bundle. spoolctl drives the same
    // daemon lifecycle the app does, from a terminal, so adopt-versus-start can
    // be checked without a menu bar. icon draws Resources/AppIcon.icns.
    .executableTarget(name: "spoolctl", dependencies: ["SpoolKit"]),
    .executableTarget(name: "icon", dependencies: ["SpoolKit"]),

    // Offline checks on the parts that have to agree with the TypeScript:
    // daemon.json's shape, the mark geometry, release-number ordering.
    .testTarget(name: "SpoolKitTests", dependencies: ["SpoolKit"]),
  ]
)
