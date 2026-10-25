import SwiftUI
import AVFoundation

enum ReadingCollectionFilter: String, CaseIterable, Identifiable {
    case all = "全部", unread = "未读", finished = "已读"
    var id: String { rawValue }
    func includes(done: Bool) -> Bool {
        self == .all || (self == .finished ? done : !done)
    }
}

extension PassageKind {
    var displayName: String {
        switch self {
        case .poem, .ancientPoem: return "古诗"
        case .prose:              return "课文"
        case .story:              return "故事"
        case .song:               return "儿歌"
        case .dialogue:           return "对话"
        }
    }
    var symbol: String {
        switch self {
        case .poem, .ancientPoem: return "scroll.fill"
        case .prose:              return "text.alignleft"
        case .story:              return "book.fill"
        case .song:               return "music.note"
        case .dialogue:           return "bubble.left.and.bubble.right.fill"
        }
    }
}

/// Per-book passage list — illustrated cards with completion crowns.
struct PassageListView: View {
    let bookId: String
    @Binding var path: [AppRoute]
    @ObservedObject private var progressStore = ProgressStore.shared

    @State private var passages: [Passage] = []
    @State private var loadError: String?
    @State private var filter: ReadingCollectionFilter = .all

    private var visiblePassages: [Passage] {
        passages.filter { filter.includes(done: progressStore.isReadingCompleted(Reading.id(.listen, $0.id))) }
    }

    var body: some View {
        ScrollView {
            if !passages.isEmpty {
                LazyVStack(spacing: 16) {
                    LearningPageHeader(eyebrow: "课文听读", title: "听见文字里的世界", subtitle: "\(passages.count) 篇课文 · 听一听，读一读，再跟聪聪练一遍。", tint: DuoColors.secondary)
                    Picker("阅读状态", selection: $filter) {
                        ForEach(ReadingCollectionFilter.allCases) { Text($0.rawValue).tag($0) }
                    }.pickerStyle(.segmented)
                    ForEach(visiblePassages, id: \.id) { p in
                        Button { path.append(.passageReader(bookId: bookId, passageId: p.id)) } label: {
                            ReadingCard(
                                title: p.title,
                                subtitle: [p.curriculumRoleLabel, p.kind.displayName, "\(p.sentences.count) 句"].compactMap { $0 }.joined(separator: " · "),
                                symbol: p.kind.symbol,
                                tint: DuoColors.secondary,
                                done: progressStore.isReadingCompleted(Reading.id(.listen, p.id)),
                                rewardXP: Economy.ReadingXP.listen
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("passage-\(p.id)")
                    }
                    if visiblePassages.isEmpty {
                        Text("这里暂时没有课文，换个分类看看吧。")
                            .duoFont(.body).foregroundStyle(DuoColors.inkMuted).padding(24)
                    }
                }
                .learningContent()
            } else {
                emptyState
            }
        }
        .background(DuoColors.canvas.ignoresSafeArea())
        .navigationTitle("课文听读")
        .navigationBarTitleDisplayMode(.inline)
        .task { load() }
    }

    private var emptyState: some View {
        VStack(spacing: 12) {
            Image(systemName: "text.book.closed").font(.system(size: 44)).foregroundStyle(DuoColors.inkSofter)
            Text(loadError ?? "这本书还没有课文听读")
                .duoFont(.subhead).foregroundStyle(DuoColors.inkMuted)
                .multilineTextAlignment(.center)
        }
        .padding(40)
    }

    private func load() {
        do { passages = (try DataLoader.shared.loadPassages(bookId: bookId))?.passages ?? [] }
        catch { loadError = (error as? LocalizedError)?.errorDescription ?? String(describing: error) }
    }
}

/// Shared illustrated card for passages & stories.
/// `rewardXP` keeps the「+N」chip honest per activity type (content-5);
/// `imageURL` swaps the icon block for a real illustration banner (content-8).
struct ReadingCard: View {
    let title: String
    let subtitle: String
    let symbol: String
    let tint: Color
    let done: Bool
    var rewardXP: Int = Economy.ReadingXP.listen
    var imageURL: URL? = nil

    var body: some View {
        VStack(spacing: 0) {
            if let imageURL, let ui = UIImage(contentsOfFile: imageURL.path) {
                Image(uiImage: ui)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(maxWidth: .infinity)
                    .frame(height: 120)
                    .clipped()
            }
            HStack(spacing: 14) {
                ZStack {
                    RoundedRectangle(cornerRadius: Radius.control)
                        .fill(LinearGradient(colors: [tint.opacity(0.85), tint], startPoint: .topLeading, endPoint: .bottomTrailing))
                        .frame(width: 60, height: 60)
                    Image(systemName: symbol).font(.system(size: 26, weight: .bold)).foregroundStyle(.white)
                }
                VStack(alignment: .leading, spacing: 4) {
                    Text(title).duoFont(.subhead).foregroundStyle(DuoColors.ink).lineLimit(2).multilineTextAlignment(.leading)
                    VStack(alignment: .leading, spacing: 6) {
                        Text(subtitle).duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                        if !done {
                            HStack(spacing: 2) {
                                Image(systemName: "bolt.fill").font(.system(size: 9, weight: .heavy))
                                Text("+\(rewardXP)").duoFont(.micro)
                            }
                            .foregroundStyle(DuoColors.secondary)
                        }
                    }
                }
                .frame(maxWidth: .infinity, alignment: .leading)
                if done {
                    Image(systemName: "crown.fill").font(.system(size: 22)).foregroundStyle(DuoColors.bee)
                } else {
                    Image(systemName: "chevron.right").font(.system(size: 15, weight: .heavy)).foregroundStyle(DuoColors.inkSofter)
                }
            }
            .padding(14)
        }
        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
        .clipShape(.rect(cornerRadius: Radius.card))
        .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(done ? DuoColors.bee.opacity(0.5) : DuoColors.border, lineWidth: 2) }
    }
}

/// Sentence-by-sentence reader with karaoke play-through, per-line TTS,
/// slow-mode (content-11) and a follow-up recording mode (content-3).
struct PassageReaderView: View {
    let bookId: String
    let passageId: String
    @State private var passage: Passage?
    @State private var readerError: String?
    @ObservedObject private var audioPlayer = AudioPlayer.shared
    @ObservedObject private var progressStore = ProgressStore.shared

    // ---- 完成门槛（content-5）----
    /// True once the「朗读全文」queue has drained to its natural end.
    @State private var listenedWholeThing = false
    /// Set while a read-all run started from this screen is in flight.
    @State private var readAllRunActive = false

    // ---- 跟读模式（content-3）----
    @StateObject private var followup = FollowupSession()

    var body: some View {
        Group {
            if let passage {
                reader(passage)
            } else if let readerError {
                ContentUnavailableView("暂时无法打开课文", systemImage: "book.closed", description: Text(readerError))
            } else {
                ProgressView().tint(DuoColors.primary)
            }
        }
        .background(DuoColors.bg.ignoresSafeArea())
        .navigationTitle(passage?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { MuteToggle() } }
        .task {
            do {
                passage = try DataLoader.shared.loadPassages(bookId: bookId)?.passages.first { $0.id == passageId }
                if passage == nil { readerError = "返回课文列表，确认这本课本的资源已经下载。" }
            } catch { readerError = error.localizedDescription }
        }
        .onDisappear {
            AudioPlayer.shared.stop()
            followup.teardown()   // 会话结束删除临时录音
        }
    }

    /// XP 记账 id —— 一律走 `Reading.id`(parity-1)。
    /// 手写 `"\(passageId)-followup"` 之类字面量是 iOS/web 键空间零交集的根因,
    /// 备份互通后阅读进度全部失配;规范键是 `reading:{kind}:{rawId}`。
    private var listenRewardId: String { Reading.id(.listen, passageId) }
    private var followupRewardId: String { Reading.id(.followup, passageId) }

    private func reader(_ passage: Passage) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    LearningSectionTitle(title: passage.kind.displayName, detail: "\(passage.sentences.count) 句 · 听原文，也可以用自己的声音跟读")
                    if let author = passage.author, !author.isEmpty {
                        Text("—— \(author)").duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                    }

                    ViewThatFits(in: .horizontal) {
                      HStack(spacing: 10) {
                        ReadAllButton(
                            sentences: passage.sentences,
                            isPlaying: audioPlayer.isPlaying && !followup.isActive,
                            onStarted: { readAllRunActive = true },
                            onCompleted: {
                                readAllRunActive = false
                                withAnimation(Motion.reveal) { listenedWholeThing = true }
                            }
                        )
                        .disabled(followup.isActive)
                        followupButton(passage)
                        SlowModeBadge()
                      }
                      VStack(alignment: .leading, spacing: 10) {
                        ReadAllButton(sentences: passage.sentences, isPlaying: audioPlayer.isPlaying && !followup.isActive,
                                      onStarted: { readAllRunActive = true },
                                      onCompleted: { readAllRunActive = false; listenedWholeThing = true })
                            .disabled(followup.isActive)
                        HStack(spacing: 10) { followupButton(passage); SlowModeBadge() }
                      }
                    }

                    // 错误态(麦克风被拒 / 录音起不来)也要出卡片,否则提示是死分支。
                    if followup.isActive || followup.needsAttention {
                        followupStatusCard(passage)
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(passage.sentences.enumerated()), id: \.offset) { idx, s in
                            sentenceRow(s, index: idx)
                                .id(idx)
                        }
                    }

                    if followup.stage == .finished && !followup.recordings.isEmpty {
                        FollowupCompareList(sentences: passage.sentences, followup: followup)
                    }

                }
                .learningContent()
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                completionButton(passage)
                    .frame(maxWidth: LearningLayout.contentWidth - 40)
                    .padding(.horizontal, 20).padding(.vertical, 12)
                    .frame(maxWidth: .infinity)
                    .background(DuoColors.bg)
                    .overlay(alignment: .top) { Divider() }
            }
            .onChange(of: audioPlayer.nowPlayingIndex) { _, idx in
                if let idx, idx < passage.sentences.count {
                    withAnimation(Motion.reveal) { proxy.scrollTo(idx, anchor: .center) }
                }
            }
            .onChange(of: followup.currentIndex) { _, idx in
                if let idx {
                    withAnimation(Motion.reveal) { proxy.scrollTo(idx, anchor: .center) }
                }
            }
        }
    }

    /// Highlight: follow-up的当前句优先，否则用播放器发布的索引（content-12）。
    private func highlightedIndex() -> Int? {
        if followup.isActive { return followup.currentIndex }
        return audioPlayer.nowPlayingIndex
    }

    private func sentenceRow(_ s: PassageSentence, index: Int) -> some View {
        let active = highlightedIndex() == index
        let recording = followup.stage == .recording(index)
        return HStack(alignment: .top, spacing: 10) {
            Text(s.text)
                .duoFont(.heading, weight: active ? .heavy : .regular)
                .foregroundStyle(active ? (recording ? DuoColors.ink : DuoColors.successInk) : DuoColors.ink)
                .lineSpacing(6)
                .frame(maxWidth: .infinity, alignment: .leading)
            if recording {
                Image(systemName: "mic.fill")
                    .font(.system(size: 16, weight: .bold))
                    .foregroundStyle(DuoColors.danger)
                    .symbolEffect(.pulse, options: .repeating)
            } else {
                SlowTTSButton(path: s.audio, size: 16, highlightIndex: index)
                    .disabled(followup.isActive)
            }
        }
        .padding(12)
        .background(
            active ? (recording ? DuoColors.fox.opacity(0.12) : DuoColors.primary.opacity(0.10)) : Color.clear,
            in: .rect(cornerRadius: Radius.control)
        )
        .accessibilityIdentifier("reading-sentence-\(index)")
    }

    // MARK: - 跟读（content-3）

    /// 开一轮跟读。按钮和错误卡片的「再试一次」共用同一条路径。
    private func startFollowup(_ passage: Passage) {
        readAllRunActive = false
        AudioPlayer.shared.stop()
        HapticEngine.shared.tap()
        followup.start(sentences: passage.sentences) {
            // 跟读完整走完 → 首次 +10 XP
            if !progressStore.isReadingCompleted(followupRewardId) {
                progressStore.completeReading(id: followupRewardId, xp: Economy.ReadingXP.followup)
                HapticEngine.shared.success(); SFXEngine.shared.play(.star)
            }
        }
    }

    /// 跳到系统设置页,让家长把麦克风权限打开(iosretention-3)。
    private func openAppSettings() {
        guard let url = URL(string: UIApplication.openSettingsURLString) else { return }
        UIApplication.shared.open(url)
    }

    @ViewBuilder
    private func followupButton(_ passage: Passage) -> some View {
        Button {
            if followup.isActive {
                followup.abort()
            } else {
                startFollowup(passage)
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: followup.isActive ? "stop.fill" : "mic.fill").font(.system(size: 15, weight: .heavy))
                Text(followup.isActive ? "停止跟读" : "跟读模式")
            }
        }
        .buttonStyle(ChunkySmallButtonStyle(
            background: followup.isActive ? DuoColors.danger : DuoColors.fox,
            shadowColor: followup.isActive ? DuoColors.dangerDark : DuoColors.fox.opacity(0.6)
        ))
    }

    @ViewBuilder
    private func followupStatusCard(_ passage: Passage) -> some View {
        HStack(spacing: 10) {
            switch followup.stage {
            case .playingOriginal(let i):
                Image(systemName: "speaker.wave.2.fill").font(.system(size: 16, weight: .bold)).foregroundStyle(DuoColors.primary)
                Text("听第 \(i + 1)/\(passage.sentences.count) 句，等下轮到你读").duoFont(.caption).foregroundStyle(DuoColors.ink)
                Spacer(minLength: 0)
            case .recording(let i):
                Image(systemName: "mic.fill").font(.system(size: 16, weight: .bold)).foregroundStyle(DuoColors.danger)
                Text("到你啦！大声读出第 \(i + 1) 句").duoFont(.caption).foregroundStyle(DuoColors.ink)
                Spacer(minLength: 0)
                Button("读完了") { followup.finishCurrentRecordingEarly() }
                    .buttonStyle(ChunkySmallButtonStyle(background: DuoColors.primary, shadowColor: DuoColors.primaryDark))
            case .deniedMic:
                Image(systemName: "mic.slash.fill").font(.system(size: 16, weight: .bold)).foregroundStyle(DuoColors.danger)
                Text("要先允许使用麦克风，才能跟读哦").duoFont(.caption).foregroundStyle(DuoColors.ink)
                Spacer(minLength: 0)
                Button("去设置") { openAppSettings() }
                    .buttonStyle(ChunkySmallButtonStyle(background: DuoColors.fox, shadowColor: DuoColors.fox.opacity(0.6)))
                    .accessibilityIdentifier("followup-open-settings")
            case .recordFailed:
                Image(systemName: "exclamationmark.triangle.fill").font(.system(size: 16, weight: .bold)).foregroundStyle(DuoColors.danger)
                Text("录音没能开始，先关掉别的正在录音的 App 再试试").duoFont(.caption).foregroundStyle(DuoColors.ink)
                Spacer(minLength: 0)
                Button("再试一次") { startFollowup(passage) }
                    .buttonStyle(ChunkySmallButtonStyle(background: DuoColors.fox, shadowColor: DuoColors.fox.opacity(0.6)))
                    .accessibilityIdentifier("followup-retry")
            default:
                EmptyView()
            }
        }
        .padding(12)
        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
        .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
    }

    // MARK: - 完成门槛（content-5）

    @ViewBuilder
    private func completionButton(_ passage: Passage) -> some View {
        let done = progressStore.isReadingCompleted(listenRewardId)
        let followupDone = followup.stage == .finished || progressStore.isReadingCompleted(followupRewardId)
        // 音频包没落地时「听完整篇」这条门槛是解不开的死结(iosretention-6),
        // 给一条不依赖音频的出路:自己读一遍课文也算读完。
        let audioReady = AudioPlayer.shared.hasAnyResolvable(passage.sentences.map(\.audio))
        let eligible = done || listenedWholeThing || followupDone || !audioReady
        VStack(spacing: 8) {
            Button {
                guard !done, eligible else { return }
                // 课文听读 XP —— 统一口径 Economy.ReadingXP.listen（无宝石）。
                progressStore.completeReading(id: listenRewardId, xp: Economy.ReadingXP.listen)
                HapticEngine.shared.success(); SFXEngine.shared.play(.complete)
            } label: {
                Text(done ? "已读完 ✓" : "读完了  +\(Economy.ReadingXP.listen) XP")
            }
            .buttonStyle(ChunkyButtonStyle(done || !eligible ? .disabled : .primary))
            .disabled(done || !eligible)

            if !done && !eligible {
                Text("先听完整篇课文，或跟读一遍，就能领奖励啦")
                    .duoFont(.micro).foregroundStyle(DuoColors.inkMuted)
                    .frame(maxWidth: .infinity)
            } else if !done && !audioReady {
                Text("音频还没下载完，去「课本」页补下载就能听啦；先自己读一遍，也能领奖励～")
                    .duoFont(.micro).foregroundStyle(DuoColors.inkMuted)
                    .multilineTextAlignment(.center)
                    .frame(maxWidth: .infinity)
            }
        }
        .padding(.top, 8)
    }
}

/// "Read the whole thing" button — queues every sentence's audio.
/// `onCompleted` fires only when the queue drains naturally (content-5).
///
/// 音频包没落地时按钮置灰(iosretention-6):以前照样可以点,但队列是空的 ——
/// `isPlaying` 恒 false、`onStarted`/`onCompleted` 都不触发,用户只看到「毫无反应」。
struct ReadAllButton: View {
    let sentences: [PassageSentence]
    let isPlaying: Bool
    var onStarted: (() -> Void)? = nil
    var onCompleted: (() -> Void)? = nil

    @ObservedObject private var player = AudioPlayer.shared
    @State private var runActive = false
    @State private var completionCountAtStart = 0
    @State private var runId = 0

    /// 这篇课文/故事本地有没有任何一句音频能播。
    private var hasAudio: Bool {
        AudioPlayer.shared.hasAnyResolvable(sentences.map(\.audio))
    }

    var body: some View {
        Button {
            guard hasAudio else { return }
            if isPlaying {
                runActive = false
                AudioPlayer.shared.stop()
            } else {
                HapticEngine.shared.tap()
                completionCountAtStart = AudioPlayer.shared.queueCompletionCount
                AudioPlayer.shared.play(paths: sentences.map(\.audio))
                if AudioPlayer.shared.isPlaying {
                    runId = AudioPlayer.shared.currentRunId
                    runActive = true
                    onStarted?()
                }
            }
        } label: {
            HStack(spacing: 8) {
                Image(systemName: hasAudio ? (isPlaying ? "stop.fill" : "play.fill") : "arrow.down.circle")
                    .font(.system(size: 15, weight: .heavy))
                Text(hasAudio ? (isPlaying ? "停止朗读" : "朗读全文") : "音频还没下载完")
            }
        }
        .buttonStyle(ChunkySmallButtonStyle(
            background: hasAudio ? (isPlaying ? DuoColors.danger : DuoColors.primary) : DuoColors.inkSofter,
            shadowColor: hasAudio ? (isPlaying ? DuoColors.dangerDark : DuoColors.primaryDark) : DuoColors.inkMuted
        ))
        .disabled(!hasAudio)
        .accessibilityIdentifier("read-all")
        .onChange(of: player.isPlaying) { _, playing in
            // By the time this fires, a natural drain has already bumped
            // `queueCompletionCount` (both happen in the same MainActor turn),
            // so comparing against the count at run start tells completion
            // apart from stop()/interruption. The runId check makes sure the
            // completion belongs to OUR whole-passage run — a single-line tap
            // that interrupted us must not satisfy the listen gate.
            guard runActive, !playing else { return }
            runActive = false
            if player.queueCompletionCount > completionCountAtStart,
               player.currentRunId == runId {
                onCompleted?()
            }
        }
    }
}

// ============================================================
// 乌龟慢速（content-11）
// ============================================================

/// TTS speaker button with a long-press slow-mode toggle.
/// Tap = play this line; long-press = toggle 0.65× turtle speed globally.
/// Renders nothing when the audio file is missing (mirrors `TTSButton`).
/// `highlightIndex` pads the queue so `nowPlayingIndex` publishes the row's
/// real sentence index (content-12) — readers highlight the correct line even
/// for single-line playback of duplicate sentences.
struct SlowTTSButton: View {
    let path: String?
    var size: CGFloat = 20
    var highlightIndex: Int? = nil

    @ObservedObject private var player = AudioPlayer.shared
    @ObservedObject private var settings = SettingsStore.shared

    private var resolvedExists: Bool {
        guard let path else { return false }
        return AudioPlayer.shared.resolve(path) != nil
    }

    var body: some View {
        if let path, resolvedExists {
            Button {
                if let highlightIndex, highlightIndex > 0 {
                    player.play(paths: [String?](repeating: nil, count: highlightIndex) + [path], settings: settings)
                } else {
                    player.play(path: path, settings: settings)
                }
            } label: {
                Image(systemName: settings.isMuted ? "speaker.slash.fill" : "speaker.wave.2.fill")
                    .font(.system(size: size, weight: .semibold))
                    .foregroundStyle(.tint)
                    .padding(8)
                    .background(Color.accentColor.opacity(0.12), in: .circle)
                    .overlay(alignment: .bottomTrailing) {
                        if player.isSlowMode {
                            Text("🐢").font(.system(size: size * 0.6)).offset(x: 3, y: 3)
                        }
                    }
            }
            .simultaneousGesture(LongPressGesture(minimumDuration: 0.45).onEnded { _ in
                player.isSlowMode.toggle()
                HapticEngine.shared.tap()
            })
            .accessibilityLabel(player.isSlowMode ? "朗读（慢速）" : "朗读")
            .accessibilityIdentifier("tts-play")
        } else {
            EmptyView()
        }
    }
}

/// Turtle chip: shows/toggles the global slow-mode state (content-11 状态提示).
struct SlowModeBadge: View {
    @ObservedObject private var player = AudioPlayer.shared

    var body: some View {
        Button {
            player.isSlowMode.toggle()
            HapticEngine.shared.tap()
        } label: {
            HStack(spacing: 4) {
                Text("🐢").font(.system(size: 14))
                Text(player.isSlowMode ? "慢速中" : "慢速").duoFont(.micro)
            }
            .foregroundStyle(player.isSlowMode ? DuoColors.primary : DuoColors.inkMuted)
            .padding(.horizontal, 10).padding(.vertical, 8)
            .background(
                player.isSlowMode ? DuoColors.primary.opacity(0.14) : DuoColors.surfaceAlt,
                in: .capsule
            )
            .overlay {
                Capsule().strokeBorder(player.isSlowMode ? DuoColors.primary.opacity(0.5) : DuoColors.border, lineWidth: 1.5)
            }
        }
        .buttonStyle(.plain)
        .accessibilityLabel(player.isSlowMode ? "关闭慢速朗读" : "开启慢速朗读")
        .accessibilityIdentifier("slow-mode-toggle")
    }
}

// ============================================================
// 跟读会话（content-3）
// ============================================================

/// Drives the「原音 → 录音 → 下一句」follow-up loop and owns the temp
/// recordings. Recordings live in a scratch folder under tmp/ and are deleted
/// on `teardown()` (session end) — nothing is ever uploaded or persisted.
@MainActor
final class FollowupSession: ObservableObject {
    enum Stage: Equatable {
        case idle
        case playingOriginal(Int)
        case recording(Int)
        case finished
        case deniedMic
        /// 会话切不到 `.playAndRecord`,或 `AVAudioRecorder.record()` 返回 false
        /// (麦克风被别的 App 占用、系统会话被打断……)。以前这里悄无声息:文件
        /// 不生成、返回值没人看,用户只见「录音中」转一圈然后什么都没有
        /// (iosretention-1)。
        case recordFailed
    }

    @Published private(set) var stage: Stage = .idle
    /// Sentence index → local recording file for the compare list.
    @Published private(set) var recordings: [Int: URL] = [:]

    private var task: Task<Void, Never>?
    private var recorder: AVAudioRecorder?
    private var playbackPlayer: AVAudioPlayer?
    private var stopCurrentRecording = false
    /// Bumped on every start(); stale (cancelled) runs must not touch `stage`.
    private var runGeneration = 0

    var isActive: Bool {
        switch stage {
        case .playingOriginal, .recording: return true
        default: return false
        }
    }

    /// 需要用户处理的错误态。状态卡的显示条件必须带上它 —— 否则
    /// `.deniedMic` / `.recordFailed` 的提示文案是永远渲染不到的死分支,
    /// 点「跟读模式」毫无反馈(iosretention-3)。
    var needsAttention: Bool {
        switch stage {
        case .deniedMic, .recordFailed: return true
        default: return false
        }
    }

    var currentIndex: Int? {
        switch stage {
        case .playingOriginal(let i), .recording(let i): return i
        default: return nil
        }
    }

    private var scratchDir: URL {
        FileManager.default.temporaryDirectory.appendingPathComponent("cstf-followup", isDirectory: true)
    }

    /// Start the follow-up loop over all sentences. `onFinished` fires only
    /// when the run walks the whole passage (not on abort).
    func start(sentences: [PassageSentence], onFinished: @escaping () -> Void) {
        abort()
        deleteRecordings()
        runGeneration += 1
        let gen = runGeneration
        task = Task { [weak self] in
            guard let self else { return }
            let granted = await AVAudioApplication.requestRecordPermission()
            guard gen == self.runGeneration else { return }
            guard granted else {
                self.stage = .deniedMic
                return
            }
            // 整轮跟读都待在 `.playAndRecord` 会话里(协调器的 `.record` 模式)。
            // 播原音时 AudioPlayer 的 `beginSpokenAudio()` 会主动让路,不再把
            // 类别切成 .playback / .ambient —— 那正是 record() 静默失败的根因
            // (iosretention-1)。切不过去就直接落错误态,别装作在录音。
            guard AudioSessionCoordinator.shared.beginRecording() else {
                self.stage = .recordFailed
                return
            }
            for (i, s) in sentences.enumerated() {
                if Task.isCancelled { break }
                // 1) 播原音
                self.stage = .playingOriginal(i)
                if let audio = s.audio {
                    AudioPlayer.shared.play(path: audio)
                    // Wait for playback to finish (or be skipped when muted).
                    while AudioPlayer.shared.isPlaying && !Task.isCancelled {
                        try? await Task.sleep(nanoseconds: 80_000_000)
                    }
                }
                if Task.isCancelled { break }
                try? await Task.sleep(nanoseconds: 250_000_000)
                if Task.isCancelled { break }

                // 2) 录音：时长按句长 3–8 秒，可提前点「读完了」
                self.stage = .recording(i)
                self.stopCurrentRecording = false
                guard let url = self.beginRecording(index: i) else {
                    // 录音起不来 —— 停下来把话说清楚,而不是空转到「跟读完成」
                    // 再给一堆放不出声的空录音。
                    self.stopRecorder()
                    AudioSessionCoordinator.shared.endRecording()
                    guard gen == self.runGeneration else { return }
                    self.stage = .recordFailed
                    return
                }
                let seconds = min(max(3.0, Double(s.text.count) * 0.28), 8.0)
                let deadline = Date().addingTimeInterval(seconds)
                while Date() < deadline && !self.stopCurrentRecording && !Task.isCancelled {
                    try? await Task.sleep(nanoseconds: 100_000_000)
                }
                self.stopRecorder()
                if FileManager.default.fileExists(atPath: url.path) {
                    self.recordings[i] = url
                }
                if Task.isCancelled { break }
                try? await Task.sleep(nanoseconds: 150_000_000)
            }
            AudioSessionCoordinator.shared.endRecording()
            guard gen == self.runGeneration else { return }   // superseded run
            if Task.isCancelled {
                self.stage = .idle
            } else {
                self.stage = .finished
                onFinished()
            }
        }
    }

    /// User tapped「读完了」on the current sentence — stop recording early.
    func finishCurrentRecordingEarly() {
        stopCurrentRecording = true
    }

    /// Interrupt an in-flight run. Keeps recordings made so far.
    ///
    /// 错误态(`.deniedMic` / `.recordFailed`)也一并复位 —— 用户去系统设置里
    /// 打开麦克风回来后再点一次「跟读模式」,必须能真的重来一遍(iosretention-3)。
    /// `.finished` 保留,对比回放列表不该被清掉。
    func abort() {
        task?.cancel()
        task = nil
        stopRecorder()
        AudioPlayer.shared.stop()
        AudioSessionCoordinator.shared.endRecording()
        if isActive || needsAttention { stage = .idle }
    }

    /// Session over (view disappeared): stop everything and delete the files.
    func teardown() {
        abort()
        playbackPlayer?.stop()
        playbackPlayer = nil
        deleteRecordings()
        stage = .idle
    }

    /// Play back the learner's own recording for sentence `index`.
    func playMyRecording(_ index: Int) {
        guard let url = recordings[index] else { return }
        AudioPlayer.shared.stop()
        playbackPlayer = try? AVAudioPlayer(contentsOf: url)
        playbackPlayer?.play()
    }

    // MARK: - Internals

    /// 起一句的录音。返回 nil = 录不了,调用方必须落到可见错误态。
    ///
    /// 会话类别只走 `AudioSessionCoordinator`(唯一出口);这里以前自己
    /// `setCategory` 而循环里播原音又把类别切走,`record()` 于是返回 false、
    /// 文件根本不生成,返回值还没人检查(iosretention-1 / -2)。
    private func beginRecording(index: Int) -> URL? {
        guard AudioSessionCoordinator.shared.beginRecording() else {
            print("[FollowupSession] record session unavailable")
            return nil
        }
        try? FileManager.default.createDirectory(at: scratchDir, withIntermediateDirectories: true)
        let url = scratchDir.appendingPathComponent("sentence-\(index).m4a")
        try? FileManager.default.removeItem(at: url)
        let settings: [String: Any] = [
            AVFormatIDKey: kAudioFormatMPEG4AAC,
            AVSampleRateKey: 22050,
            AVNumberOfChannelsKey: 1,
            AVEncoderAudioQualityKey: AVAudioQuality.medium.rawValue,
        ]
        do {
            let r = try AVAudioRecorder(url: url, settings: settings)
            guard r.record() else {
                print("[FollowupSession] AVAudioRecorder.record() refused to start")
                return nil
            }
            recorder = r
            return url
        } catch {
            print("[FollowupSession] record failed: \(error)")
            return nil
        }
    }

    /// 只停录音器,不动会话类别(会话由协调器统一收尾)。
    private func stopRecorder() {
        recorder?.stop()
        recorder = nil
    }

    private func deleteRecordings() {
        recordings = [:]
        try? FileManager.default.removeItem(at: scratchDir)
    }
}

/// 原音 vs 我的 —— 跟读完成后的逐句对比回放列表。
struct FollowupCompareList: View {
    let sentences: [PassageSentence]
    @ObservedObject var followup: FollowupSession

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                Text("我的朗读").duoFont(.subhead).foregroundStyle(DuoColors.ink)
                Spacer()
                Text("🎉 跟读完成").duoFont(.micro).foregroundStyle(DuoColors.primary)
            }
            ForEach(Array(sentences.enumerated()), id: \.offset) { i, s in
                HStack(spacing: 8) {
                    Text("\(i + 1).").duoNumeral(.caption).foregroundStyle(DuoColors.inkSofter)
                    Text(s.text).duoFont(.caption).foregroundStyle(DuoColors.ink).lineLimit(1)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    if s.audio != nil {
                        Button("原音") {
                            AudioPlayer.shared.play(paths: [String?](repeating: nil, count: i) + [s.audio])
                        }
                            .duoFont(.micro)
                            .foregroundStyle(DuoColors.primary)
                            .padding(.horizontal, 10).padding(.vertical, 6)
                            .background(DuoColors.primary.opacity(0.12), in: .capsule)
                    }
                    Button("我的") { followup.playMyRecording(i) }
                        .duoFont(.micro)
                        .foregroundStyle(followup.recordings[i] != nil ? DuoColors.secondary : DuoColors.inkSofter)
                        .padding(.horizontal, 10).padding(.vertical, 6)
                        .background(DuoColors.secondary.opacity(followup.recordings[i] != nil ? 0.14 : 0.05), in: .capsule)
                        .disabled(followup.recordings[i] == nil)
                }
            }
        }
        .padding(14)
        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
        .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
    }
}
