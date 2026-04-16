import Foundation
import AVFoundation
import Combine

/// Single-track AVAudioPlayer wrapper with a small queue API.
///
/// Question audio comes in clusters: question stem → option N → explanation.
/// Most of the time we want them played sequentially without overlapping.
/// `AudioPlayer.play(paths:)` enqueues a list and plays them in order; calling
/// `play` again interrupts the current queue.
@MainActor
final class AudioPlayer: NSObject, ObservableObject {
    static let shared = AudioPlayer()

    @Published private(set) var isPlaying: Bool = false
    /// The audio file currently being played (relative path from `Question.audio`).
    @Published private(set) var nowPlayingPath: String?

    private var player: AVAudioPlayer?
    private var queue: [URL] = []
    private var sessionConfigured = false

    /// Play one or more files in order. Empty / nil entries are skipped.
    /// Calling this interrupts any in-flight playback.
    func play(paths: [String?], settings: SettingsStore = .shared) {
        if settings.isMuted {
            stop(); return
        }
        let urls = paths.compactMap { $0 }.compactMap(resolve(_:))
        play(urls: urls, originalPaths: paths.compactMap { $0 })
    }

    /// Convenience for a single file.
    func play(path: String?, settings: SettingsStore = .shared) {
        guard let path else { return }
        play(paths: [path], settings: settings)
    }

    func stop() {
        player?.stop()
        player = nil
        queue.removeAll()
        isPlaying = false
        nowPlayingPath = nil
    }

    // MARK: - Path resolution

    /// Map a `Question.audio` style path (e.g. "/audio/8e/8ec5...opus") to
    /// the local m4a file installed by SeedInstaller / AssetDownloader.
    func resolve(_ path: String) -> URL? {
        // Drop optional leading slash, swap .opus → .m4a, drop "audio/" prefix
        // because we rebase against `sandboxAudioRoot` which already points at
        // `Application Support/cstf/audio/`.
        var rel = path
        if rel.hasPrefix("/") { rel.removeFirst() }
        if rel.hasPrefix("audio/") { rel.removeFirst("audio/".count) }
        if rel.hasSuffix(".opus") { rel = String(rel.dropLast(".opus".count)) + ".m4a" }
        let url = DataLoader.shared.sandboxAudioRoot.appendingPathComponent(rel)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    // MARK: - Internals

    private func configureSessionIfNeeded() {
        guard !sessionConfigured else { return }
        let session = AVAudioSession.sharedInstance()
        do {
            try session.setCategory(.playback, mode: .spokenAudio, options: [.duckOthers])
            try session.setActive(true, options: [])
            NotificationCenter.default.addObserver(
                self,
                selector: #selector(handleInterruption(_:)),
                name: AVAudioSession.interruptionNotification,
                object: session
            )
            sessionConfigured = true
        } catch {
            print("[AudioPlayer] session config failed: \(error)")
        }
    }

    @objc private func handleInterruption(_ note: Notification) {
        guard let info = note.userInfo,
              let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
              let type = AVAudioSession.InterruptionType(rawValue: raw) else { return }
        switch type {
        case .began:
            stop()
        case .ended:
            // We don't auto-resume — the user can tap the speaker again.
            break
        @unknown default:
            break
        }
    }

    private func play(urls: [URL], originalPaths: [String]) {
        configureSessionIfNeeded()
        stop()
        queue = urls
        playNext(allOriginals: originalPaths)
    }

    private func playNext(allOriginals: [String]) {
        guard !queue.isEmpty else {
            isPlaying = false
            nowPlayingPath = nil
            return
        }
        let next = queue.removeFirst()
        do {
            let p = try AVAudioPlayer(contentsOf: next)
            p.delegate = self
            p.prepareToPlay()
            p.play()
            self.player = p
            self.isPlaying = true
            self.nowPlayingPath = next.lastPathComponent
        } catch {
            print("[AudioPlayer] play failed for \(next.lastPathComponent): \(error)")
            playNext(allOriginals: allOriginals)
        }
    }
}

extension AudioPlayer: AVAudioPlayerDelegate {
    nonisolated func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
        Task { @MainActor in
            self.playNext(allOriginals: [])
        }
    }
}
