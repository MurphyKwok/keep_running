import AppKit
import Foundation

struct IconSize {
    let density: String
    let pixels: Int
}

guard CommandLine.arguments.count == 3 else {
    fputs("Usage: swift scripts/generate-android-icons.swift <source.png> <res-root>\n", stderr)
    exit(2)
}

let sourcePath = CommandLine.arguments[1]
let resourcesRoot = CommandLine.arguments[2]

guard let image = NSImage(contentsOfFile: sourcePath) else {
    fputs("Unable to read source icon: \(sourcePath)\n", stderr)
    exit(1)
}

let sizes = [
    IconSize(density: "mdpi", pixels: 48),
    IconSize(density: "hdpi", pixels: 72),
    IconSize(density: "xhdpi", pixels: 96),
    IconSize(density: "xxhdpi", pixels: 144),
    IconSize(density: "xxxhdpi", pixels: 192),
]

let sourceSize = image.size
let sourceSide = min(sourceSize.width, sourceSize.height)
let sourceRect = NSRect(
    x: (sourceSize.width - sourceSide) / 2,
    y: (sourceSize.height - sourceSide) / 2,
    width: sourceSide,
    height: sourceSide
)

for size in sizes {
    let directory = URL(fileURLWithPath: resourcesRoot)
        .appendingPathComponent("mipmap-\(size.density)", isDirectory: true)
    try FileManager.default.createDirectory(
        at: directory,
        withIntermediateDirectories: true
    )

    guard let bitmap = NSBitmapImageRep(
        bitmapDataPlanes: nil,
        pixelsWide: size.pixels,
        pixelsHigh: size.pixels,
        bitsPerSample: 8,
        samplesPerPixel: 4,
        hasAlpha: true,
        isPlanar: false,
        colorSpaceName: .deviceRGB,
        bytesPerRow: 0,
        bitsPerPixel: 0
    ), let context = NSGraphicsContext(bitmapImageRep: bitmap) else {
        fputs("Unable to create \(size.pixels)x\(size.pixels) icon\n", stderr)
        exit(1)
    }

    NSGraphicsContext.saveGraphicsState()
    NSGraphicsContext.current = context
    context.imageInterpolation = .high
    NSColor.clear.setFill()
    NSRect(x: 0, y: 0, width: size.pixels, height: size.pixels).fill()
    image.draw(
        in: NSRect(x: 0, y: 0, width: size.pixels, height: size.pixels),
        from: sourceRect,
        operation: .sourceOver,
        fraction: 1,
        respectFlipped: false,
        hints: [.interpolation: NSImageInterpolation.high]
    )
    NSGraphicsContext.restoreGraphicsState()

    guard let png = bitmap.representation(using: .png, properties: [:]) else {
        fputs("Unable to encode \(size.density) icon\n", stderr)
        exit(1)
    }

    try png.write(to: directory.appendingPathComponent("ic_launcher.png"))
    try png.write(to: directory.appendingPathComponent("ic_launcher_round.png"))
}
