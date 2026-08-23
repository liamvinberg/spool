import Testing

@testable import SpoolKit

@Suite("release numbers")
struct VersionTests {
  @Test("takes a tag with or without its v")
  func parses() {
    #expect(SpoolVersion("0.8.0")?.description == "0.8.0")
    #expect(SpoolVersion("v0.8.0")?.description == "0.8.0")
    #expect(SpoolVersion("v10.2.30")?.description == "10.2.30")
  }

  @Test("refuses anything it cannot rank")
  func refuses() {
    // Ranking one of these wrong points somebody at a downgrade, so none of them
    // is guessed at.
    #expect(SpoolVersion("1.2") == nil)
    #expect(SpoolVersion("1.2.3.4") == nil)
    #expect(SpoolVersion("1.2.3-rc.1") == nil)
    #expect(SpoolVersion("v") == nil)
    #expect(SpoolVersion("1.2.+3") == nil)
    #expect(SpoolVersion("") == nil)
  }

  @Test("orders by major, then minor, then patch")
  func orders() {
    #expect(SpoolVersion("0.9.0")! > SpoolVersion("0.8.9")!)
    #expect(SpoolVersion("1.0.0")! > SpoolVersion("0.99.99")!)
    #expect(SpoolVersion("0.8.10")! > SpoolVersion("0.8.9")!)
    #expect(SpoolVersion("0.8.0")! == SpoolVersion("v0.8.0")!)
  }
}
