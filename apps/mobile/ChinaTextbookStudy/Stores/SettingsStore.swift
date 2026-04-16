import Foundation
import Combine

/// Persistent user preferences (mute, autoplay TTS, etc.).
/// State is mirrored to UserDefaults so the values are available
/// synchronously at app launch.
@MainActor
final class SettingsStore: ObservableObject {
    static let shared = SettingsStore()

    @Published var isMuted: Bool {
        didSet { defaults.set(isMuted, forKey: Keys.muted) }
    }

    @Published var autoNarrate: Bool {
        didSet { defaults.set(autoNarrate, forKey: Keys.autoNarrate) }
    }

    private let defaults = UserDefaults.standard

    private enum Keys {
        static let muted = "cstf.muted"
        static let autoNarrate = "cstf.autoNarrate"
    }

    init() {
        self.isMuted = defaults.bool(forKey: Keys.muted)
        // Default ON — auto-narration is the whole point of the audio bundle.
        self.autoNarrate = defaults.object(forKey: Keys.autoNarrate) as? Bool ?? true
    }

    func toggleMute() {
        isMuted.toggle()
    }
}
