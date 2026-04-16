import SwiftUI

/// Inline speaker button that plays a single audio path through the shared
/// `AudioPlayer`. No-op (and renders nothing) when the path is nil OR the
/// resolved file does not exist on disk — that way the lesson UI degrades
/// gracefully when only some questions have audio.
struct TTSButton: View {
    let path: String?
    var size: CGFloat = 20

    @ObservedObject private var player = AudioPlayer.shared
    @ObservedObject private var settings = SettingsStore.shared

    private var resolvedExists: Bool {
        guard let path else { return false }
        return AudioPlayer.shared.resolve(path) != nil
    }

    var body: some View {
        if let path, resolvedExists {
            Button {
                player.play(path: path, settings: settings)
            } label: {
                Image(systemName: settings.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.system(size: size, weight: .semibold))
                    .foregroundStyle(.tint)
                    .padding(8)
                    .background(Color.accentColor.opacity(0.12), in: .circle)
            }
            .accessibilityLabel("朗读")
            .accessibilityIdentifier("tts-play")
        } else {
            EmptyView()
        }
    }
}

/// Small toolbar item the lesson runner / settings can use to mute audio.
struct MuteToggle: View {
    @ObservedObject private var settings = SettingsStore.shared
    @ObservedObject private var player = AudioPlayer.shared

    var body: some View {
        Button {
            settings.toggleMute()
            if settings.isMuted { player.stop() }
        } label: {
            Image(systemName: settings.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
        }
        .accessibilityLabel(settings.isMuted ? "取消静音" : "静音")
        .accessibilityIdentifier("mute-toggle")
    }
}
