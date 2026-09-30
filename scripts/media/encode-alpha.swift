import Foundation
import AVFoundation
import CoreVideo
let output = URL(fileURLWithPath: CommandLine.arguments[1])
let width = Int(CommandLine.arguments[2])!, height = Int(CommandLine.arguments[3])!
let fps = Int32(CommandLine.arguments[4])!
try? FileManager.default.removeItem(at: output)
let writer = try AVAssetWriter(outputURL: output, fileType: .mov)
let input = AVAssetWriterInput(mediaType: .video, outputSettings: [AVVideoCodecKey: AVVideoCodecType.hevcWithAlpha, AVVideoWidthKey: width, AVVideoHeightKey: height, AVVideoCompressionPropertiesKey: [AVVideoAverageBitRateKey: 1400000, AVVideoMaxKeyFrameIntervalKey: fps]])
input.expectsMediaDataInRealTime = false
let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: [kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,kCVPixelBufferWidthKey as String: width,kCVPixelBufferHeightKey as String: height,kCVPixelBufferIOSurfacePropertiesKey as String: [:]])
writer.add(input)
guard writer.startWriting() else { fatalError("start: \(String(describing:writer.error))") }
writer.startSession(atSourceTime: .zero)
let size = width * height * 4
var frame: Int64 = 0
while true {
 var data = Data()
 while data.count < size { let part = try FileHandle.standardInput.read(upToCount: size-data.count) ?? Data(); if part.isEmpty { break }; data.append(part) }
 if data.isEmpty { break }; guard data.count == size else { fatalError("incomplete frame") }
 while !input.isReadyForMoreMediaData { if writer.status == .failed { fatalError("writer: \(String(describing:writer.error))") }; Thread.sleep(forTimeInterval: 0.005) }
 var pixel: CVPixelBuffer?
 guard CVPixelBufferPoolCreatePixelBuffer(nil, adaptor.pixelBufferPool!, &pixel) == kCVReturnSuccess, let pixel else { fatalError("buffer") }
 CVPixelBufferLockBaseAddress(pixel, [])
 data.withUnsafeBytes { src in
 let dest = CVPixelBufferGetBaseAddress(pixel)!, stride = CVPixelBufferGetBytesPerRow(pixel)
 for row in 0..<height { memcpy(dest.advanced(by: row*stride), src.baseAddress!.advanced(by:row*width*4), width*4) }
 }
 CVPixelBufferUnlockBaseAddress(pixel, [])
 guard adaptor.append(pixel, withPresentationTime: CMTime(value: frame, timescale: fps)) else { fatalError("append: \(String(describing:writer.error))") }
 frame += 1
}
input.markAsFinished()
let done = DispatchSemaphore(value:0)
writer.finishWriting { done.signal() }; done.wait()
guard writer.status == .completed else { fatalError("finish: \(String(describing:writer.error))") }
print("encoded \(frame) frames")
