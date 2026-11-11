// record-window <pid> <out.mov>: films the largest window of a process on the Mac at 60 fps with ScreenCaptureKit,
// its own pixels only (no cursor, no shadow, nothing that floats over it), into an H.264 file at a high bitrate.
// A picture comes only when the window changes, so whoever starts it makes the window draw once.
// Prints `first <epoch ms>` when the first picture is in, and stops at a line or the end of stdin, printing `done`.
// Built and run on the m1 by m1.ts, inside its desktop session, whose Screen Recording grant it runs under.
import AppKit
import AVFoundation
import CoreMedia
import Foundation
import ScreenCaptureKit

/// One line out, then a blank one past it: the m1's gui wrapper holds back its last 16 bytes until more come.
func say(_ line: String) {
	print(line)
	print(String(repeating: " ", count: 32))
	fflush(stdout)
}

func fail(_ message: String) -> Never {
	FileHandle.standardError.write("record-window: \(message)\n".data(using: .utf8)!)
	exit(1)
}

final class Recorder: NSObject, SCStreamOutput, SCStreamDelegate {
	let writer: AVAssetWriter
	let input: AVAssetWriterInput
	let queue = DispatchQueue(label: "record-window")
	var started = false

	init(out: URL, width: Int, height: Int) throws {
		writer = try AVAssetWriter(outputURL: out, fileType: .mov)
		input = AVAssetWriterInput(
			mediaType: .video,
			outputSettings: [
				AVVideoCodecKey: AVVideoCodecType.h264,
				AVVideoWidthKey: width,
				AVVideoHeightKey: height,
				AVVideoCompressionPropertiesKey: [
					AVVideoAverageBitRateKey: 60_000_000,
					AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel,
					AVVideoExpectedSourceFrameRateKey: 60,
					AVVideoMaxKeyFrameIntervalKey: 60,
				],
			]
		)
		input.expectsMediaDataInRealTime = true
		writer.add(input)
	}

	func stream(_ stream: SCStream, didOutputSampleBuffer buffer: CMSampleBuffer, of type: SCStreamOutputType) {
		guard type == .screen, buffer.isValid else { return }
		// only complete frames carry a picture; idle ones say nothing changed
		guard
			let attachments = CMSampleBufferGetSampleAttachmentsArray(buffer, createIfNecessary: false)
				as? [[SCStreamFrameInfo: Any]],
			let raw = attachments.first?[.status] as? Int,
			SCFrameStatus(rawValue: raw) == .complete
		else { return }
		if !started {
			started = true
			writer.startWriting()
			writer.startSession(atSourceTime: buffer.presentationTimeStamp)
			say("first \(Int(Date().timeIntervalSince1970 * 1000))")
			fflush(stdout)
		}
		if input.isReadyForMoreMediaData { input.append(buffer) }
	}

	func stream(_ stream: SCStream, didStopWithError error: Error) {
		fail("the capture stopped: \(error.localizedDescription)")
	}
}

// a command line tool joins the window server before ScreenCaptureKit can look at windows
_ = NSApplication.shared
let args = CommandLine.arguments
guard args.count == 3, let pid = pid_t(args[1]) else { fail("usage: record-window <pid> <out.mov>") }
let out = URL(fileURLWithPath: args[2])
try? FileManager.default.removeItem(at: out)

let content = try await SCShareableContent.excludingDesktopWindows(true, onScreenWindowsOnly: true)
guard
	let window = content.windows
		.filter({ $0.owningApplication?.processID == pid && $0.windowLayer == 0 })
		.max(by: { $0.frame.width * $0.frame.height < $1.frame.width * $1.frame.height })
else { fail("no window of process \(pid) on screen") }

let filter = SCContentFilter(desktopIndependentWindow: window)
let scale = CGFloat(filter.pointPixelScale)
let width = Int(window.frame.width * scale) & ~1
let height = Int(window.frame.height * scale) & ~1
let config = SCStreamConfiguration()
config.width = width
config.height = height
config.minimumFrameInterval = CMTime(value: 1, timescale: 60)
config.showsCursor = false
config.queueDepth = 8
config.pixelFormat = kCVPixelFormatType_32BGRA
config.colorSpaceName = CGColorSpace.sRGB

let recorder = try Recorder(out: out, width: width, height: height)
let stream = SCStream(filter: filter, configuration: config, delegate: recorder)
try stream.addStreamOutput(recorder, type: .screen, sampleHandlerQueue: recorder.queue)
try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
	stream.startCapture { error in if let error { done.resume(throwing: error) } else { done.resume() } }
}
say("window \(Int(window.frame.minX)) \(Int(window.frame.minY)) \(Int(window.frame.width)) \(Int(window.frame.height)) \(scale)")
fflush(stdout)

_ = readLine()
try await withCheckedThrowingContinuation { (done: CheckedContinuation<Void, Error>) in
	stream.stopCapture { error in if let error { done.resume(throwing: error) } else { done.resume() } }
}
await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
	recorder.queue.async {
		guard recorder.started else { fail("the window never drew a picture") }
		// a still end of the take lasts until now, though nothing changed to send a picture
		recorder.writer.endSession(atSourceTime: CMClockGetTime(CMClockGetHostTimeClock()))
		recorder.input.markAsFinished()
		recorder.writer.finishWriting { done.resume() }
	}
}
if recorder.writer.status != .completed { fail("the file could not be written: \(String(describing: recorder.writer.error))") }
say("done")
