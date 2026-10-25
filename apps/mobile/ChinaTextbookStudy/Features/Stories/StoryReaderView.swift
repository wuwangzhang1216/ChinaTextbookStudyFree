import SwiftUI

/// Per-book story list — illustrated cards with completion crowns.
struct StoryListView: View {
    let bookId: String
    @Binding var path: [AppRoute]
    @ObservedObject private var progressStore = ProgressStore.shared

    @State private var stories: [Story] = []
    @State private var loadError: String?
    @State private var filter: ReadingCollectionFilter = .all

    private var visibleStories: [Story] {
        stories.filter { filter.includes(done: progressStore.isReadingCompleted(Reading.id(.story, $0.id))) }
    }

    var body: some View {
        ScrollView {
            if !stories.isEmpty {
                LazyVStack(spacing: 16) {
                    LearningPageHeader(eyebrow: "课外故事", title: "读一篇，发现新世界", subtitle: "\(stories.count) 篇故事 · 读完故事，再用小问题检验自己的发现。", tint: DuoColors.beetle)
                    Picker("阅读状态", selection: $filter) {
                        ForEach(ReadingCollectionFilter.allCases) { Text($0.rawValue).tag($0) }
                    }.pickerStyle(.segmented)
                    ForEach(visibleStories, id: \.id) { s in
                        Button { path.append(.storyReader(bookId: bookId, storyId: s.id)) } label: {
                            ReadingCard(
                                title: s.title,
                                subtitle: "第\(s.unitNumber)单元 · \(s.questions.count) 题",
                                symbol: "book.pages.fill",
                                tint: DuoColors.beetle,
                                done: progressStore.isReadingCompleted(Reading.id(.story, s.id)),
                                rewardXP: Economy.ReadingXP.storyGood,
                                imageURL: AssetDownloader.storyImageURL(bookId: bookId, storyId: s.id, imagePath: s.image)
                            )
                        }
                        .buttonStyle(.plain)
                        .accessibilityIdentifier("story-\(s.id)")
                    }
                    if visibleStories.isEmpty {
                        Text("这里暂时没有故事，换个分类看看吧。")
                            .duoFont(.body).foregroundStyle(DuoColors.inkMuted).padding(24)
                    }
                }
                .learningContent()
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "book.closed").font(.system(size: 44)).foregroundStyle(DuoColors.inkSofter)
                    Text(loadError ?? "这本书还没有课外故事").duoFont(.subhead).foregroundStyle(DuoColors.inkMuted)
                }
                .padding(40)
            }
        }
        .background(DuoColors.canvas.ignoresSafeArea())
        .navigationTitle("课外故事")
        .navigationBarTitleDisplayMode(.inline)
        .task { load() }
    }

    private func load() {
        do { stories = (try DataLoader.shared.loadStories(bookId: bookId))?.stories ?? [] }
        catch { loadError = (error as? LocalizedError)?.errorDescription ?? String(describing: error) }
    }
}

/// Story reader — three phases like the web client (content-14):
///   1. 阅读：插画 + karaoke 逐句
///   2. 答题：逐题流（进度条 + 检查/下一题 footer）
///   3. 结果：三星 + 正确率 + XP（accuracy ≥ 0.8 → 15，否则 5）
struct StoryReaderView: View {
    let bookId: String
    let storyId: String

    private enum Phase: Equatable { case reading, quiz, result }

    @State private var story: Story?
    @State private var readerError: String?
    @State private var phase: Phase = .reading
    /// Gate for questionless stories: whole-story listen unlocks completion.
    @State private var listenedWholeThing = false

    // ---- Quiz state ----
    @State private var qIndex = 0
    @State private var qPhase: LessonRunnerView.QuestionPhase = .answering
    @State private var currentAnswer = ""
    @State private var isCorrect: Bool? = nil
    @State private var correctCount = 0
    @State private var awarded = false

    @ObservedObject private var audioPlayer = AudioPlayer.shared
    @ObservedObject private var progressStore = ProgressStore.shared
    @Environment(\.dismiss) private var dismiss

    /// XP 记账 id —— 规范键 `reading:story:{storyId}`(parity-1)。
    /// 不要再直接拿 `story.id` 当 key:那是 iOS 私有键空间,与 web 的
    /// `story-{id}` 对不上,备份互通后进度会全部失配。
    private var storyRewardId: String { Reading.id(.story, storyId) }

    var body: some View {
        Group {
            if let story {
                switch phase {
                case .reading: readingPhase(story)
                case .quiz:    quizPhase(story)
                case .result:  resultPhase(story)
                }
            } else if let readerError {
                ContentUnavailableView("暂时无法打开故事", systemImage: "book.closed", description: Text(readerError))
            } else {
                ProgressView().tint(DuoColors.primary)
            }
        }
        .background(DuoColors.bg.ignoresSafeArea())
        .navigationTitle(story?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { MuteToggle() } }
        .toolbar(phase == .quiz || phase == .result ? .hidden : .visible, for: .navigationBar)
        .task {
            do {
                story = try DataLoader.shared.loadStories(bookId: bookId)?.stories.first { $0.id == storyId }
                if story == nil { readerError = "返回故事列表，确认这本课本的资源已经下载。" }
            } catch { readerError = error.localizedDescription }
        }
        .onDisappear { AudioPlayer.shared.stop() }
    }

    // ============================================================
    // Phase 1 — 阅读
    // ============================================================

    private func readingPhase(_ story: Story) -> some View {
        ScrollViewReader { proxy in
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    illustrationHeader(story)
                    LearningSectionTitle(title: "先读故事，再试一试", detail: "\(story.sentences.count) 句\(story.questions.isEmpty ? "" : " · \(story.questions.count) 道阅读理解题")")

                    HStack(spacing: 10) {
                        ReadAllButton(
                            sentences: story.sentences,
                            isPlaying: audioPlayer.isPlaying,
                            onCompleted: { withAnimation(Motion.reveal) { listenedWholeThing = true } }
                        )
                        SlowModeBadge()
                    }

                    VStack(alignment: .leading, spacing: 10) {
                        ForEach(Array(story.sentences.enumerated()), id: \.offset) { idx, s in
                            sentenceRow(s, index: idx).id(idx)
                        }
                    }

                }
                .learningContent()
            }
            .safeAreaInset(edge: .bottom, spacing: 0) {
                LearningActionDock { bottomAction(story) }
            }
            .onChange(of: audioPlayer.nowPlayingIndex) { _, idx in
                if let idx, idx < story.sentences.count {
                    withAnimation(Motion.reveal) { proxy.scrollTo(idx, anchor: .center) }
                }
            }
        }
    }

    /// 插画（content-8）：本地文件存在时显示，缺失时优雅降级为占位色块。
    @ViewBuilder
    private func illustrationHeader(_ story: Story) -> some View {
        let url = AssetDownloader.storyImageURL(bookId: bookId, storyId: story.id, imagePath: story.image)
        Group {
            if let url, let ui = UIImage(contentsOfFile: url.path) {
                Image(uiImage: ui)
                    .resizable()
                    .aspectRatio(contentMode: .fill)
                    .frame(maxWidth: .infinity)
                    .frame(height: 180)
                    .clipped()
            } else {
                ZStack {
                    LinearGradient(
                        colors: [DuoColors.beetle.opacity(0.55), DuoColors.beetle],
                        startPoint: .topLeading, endPoint: .bottomTrailing
                    )
                    Image(systemName: "book.pages.fill")
                        .font(.system(size: 44, weight: .bold))
                        .foregroundStyle(.white.opacity(0.85))
                }
                .frame(maxWidth: .infinity)
                .frame(height: 120)
            }
        }
        .clipShape(.rect(cornerRadius: Radius.card))
        .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(DuoColors.border, lineWidth: 2) }
    }

    private func sentenceRow(_ s: PassageSentence, index: Int) -> some View {
        let active = audioPlayer.nowPlayingIndex == index
        return HStack(alignment: .top, spacing: 10) {
            Text(s.text)
                .duoFont(.heading, weight: active ? .heavy : .regular)
                .foregroundStyle(active ? DuoColors.primary : DuoColors.ink)
                .lineSpacing(6)
                .frame(maxWidth: .infinity, alignment: .leading)
            SlowTTSButton(path: s.audio, size: 16, highlightIndex: index)
        }
        .padding(12)
        .background(active ? DuoColors.primary.opacity(0.10) : Color.clear, in: .rect(cornerRadius: Radius.control))
    }

    /// Bottom of the reading phase: quiz entry, or a listen-gated completion
    /// button for the rare story without questions (content-5).
    @ViewBuilder
    private func bottomAction(_ story: Story) -> some View {
        let done = progressStore.isReadingCompleted(storyRewardId)
        if !story.questions.isEmpty {
            VStack(spacing: 8) {
                Button {
                    AudioPlayer.shared.stop()
                    HapticEngine.shared.tap()
                    // Reset quiz state so a retake starts clean.
                    qIndex = 0; currentAnswer = ""; qPhase = .answering; isCorrect = nil; correctCount = 0
                    withAnimation(Motion.reveal) { phase = .quiz }
                } label: {
                    Text(done ? "再答一次题" : "开始答题  \(story.questions.count) 道题")
                }
                .buttonStyle(ChunkyButtonStyle(.primary))
                .accessibilityIdentifier("story-quiz-start")
                if done {
                    Text("已读完 ✓ 奖励只发一次，但可以再练").duoFont(.micro).foregroundStyle(DuoColors.inkMuted)
                        .frame(maxWidth: .infinity)
                }
            }
            .padding(.top, 8)
        } else {
            // 没有音频包时「听完整个故事」永远解不开(iosretention-6):
            // 给一条不依赖音频的出路,自己读一遍也算读完。
            let audioReady = AudioPlayer.shared.hasAnyResolvable(story.sentences.map(\.audio))
            let eligible = done || listenedWholeThing || !audioReady
            VStack(spacing: 8) {
                Button {
                    guard !done, eligible else { return }
                    progressStore.completeReading(id: storyRewardId, xp: Economy.ReadingXP.storyGood)
                    HapticEngine.shared.success(); SFXEngine.shared.play(.complete)
                } label: {
                    Text(done ? "已读完 ✓" : "读完了  +\(Economy.ReadingXP.storyGood) XP")
                }
                .buttonStyle(ChunkyButtonStyle(done || !eligible ? .disabled : .primary))
                .disabled(done || !eligible)
                if !done && !eligible {
                    Text("先听完整个故事，就能领奖励啦").duoFont(.micro).foregroundStyle(DuoColors.inkMuted)
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

    // ============================================================
    // Phase 2 — 答题
    // ============================================================

    private func quizPhase(_ story: Story) -> some View {
        let q = Self.question(from: story.questions[qIndex])
        return VStack(spacing: 0) {
            LearningActivityHeader(progress: Double(qIndex + (qPhase == .checked ? 1 : 0)) / Double(max(story.questions.count, 1)),
                                   position: "\(qIndex + 1)/\(story.questions.count)", closeLabel: "返回故事",
                                   onClose: { AudioPlayer.shared.stop(); withAnimation(Motion.reveal) { phase = .reading } })

            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    Text("阅读理解").duoFont(.caption).foregroundStyle(DuoColors.beetle)
                    HStack(alignment: .top, spacing: 8) {
                        Text(MathText.render(q.question)).duoFont(.subhead, weight: .medium).foregroundStyle(DuoColors.ink)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        SlowTTSButton(path: q.audio?.question)
                    }
                    QuestionRendererView(question: q, answer: currentAnswer, phase: qPhase, isCorrect: isCorrect, onChange: { currentAnswer = $0 })
                        .id(q.id)
                }
                .learningContent()
            }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) { quizFooter(story, q: q) }
    }

    @ViewBuilder
    private func quizFooter(_ story: Story, q: Question) -> some View {
        if qPhase == .checked, let ok = isCorrect {
            LearningFeedbackPanel(correct: ok, title: ok ? "答对了！" : "再学会一点", answer: q.answer,
                                  explanation: q.explanation, audio: q.audio?.explanation,
                                  buttonTitle: qIndex + 1 >= story.questions.count ? "看结果" : "继续",
                                  onContinue: { advance(story) })
        } else {
            LearningActionDock {
                Button("检查答案") { check(q) }
                    .buttonStyle(ChunkyButtonStyle(currentAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .disabled : .primary))
                    .disabled(currentAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    .accessibilityIdentifier("检查答案")
            }
        }
    }

    private func check(_ q: Question) {
        let ok = Grade.gradeAnswer(question: q, userAnswer: currentAnswer)
        withAnimation(Motion.reveal) { isCorrect = ok; qPhase = .checked }
        if ok {
            correctCount += 1
            SFXEngine.shared.play(.correct); HapticEngine.shared.correct()
        } else {
            SFXEngine.shared.play(.wrong); HapticEngine.shared.wrong()
        }
    }

    private func advance(_ story: Story) {
        SFXEngine.shared.play(.progressTick); HapticEngine.shared.tap()
        if qIndex + 1 < story.questions.count {
            withAnimation(.easeInOut(duration: 0.2)) {
                qIndex += 1; currentAnswer = ""; isCorrect = nil; qPhase = .answering
            }
        } else {
            withAnimation(Motion.reveal) { phase = .result }
        }
    }

    // ============================================================
    // Phase 3 — 结果
    // ============================================================

    private func accuracy(_ story: Story) -> Double {
        guard !story.questions.isEmpty else { return 1 }
        return Double(correctCount) / Double(story.questions.count)
    }

    /// 三星标准与 web 一致：≥95% 三星，≥75% 两星，其余一星。
    private func stars(_ story: Story) -> Int {
        let a = accuracy(story)
        return a >= 0.95 ? 3 : (a >= 0.75 ? 2 : 1)
    }

    private func resultPhase(_ story: Story) -> some View {
        let acc = accuracy(story)
        let xp = Economy.storyQuizXp(accuracy: acc)
        let alreadyDone = progressStore.isReadingCompleted(storyRewardId)
        return LearningCelebrationBody {
          VStack(spacing: 18) {
            Spacer()
            MascotView(mood: acc >= Economy.ReadingXP.goodThreshold ? .proud : .think, size: 110, reactTo: .levelup)
            StarRevealView(earnedStars: stars(story))
            Text(acc >= Economy.ReadingXP.goodThreshold ? "读得真棒！" : "读完啦！").duoFont(.title).foregroundStyle(DuoColors.ink)
            Text("答对 \(correctCount) / \(story.questions.count) 题 · 正确率 \(Int((acc * 100).rounded()))%")
                .duoFont(.subhead).foregroundStyle(DuoColors.inkMuted)

            HStack(spacing: 6) {
                Image(systemName: "bolt.fill").font(.system(size: 15, weight: .heavy))
                Text(alreadyDone && awarded == false ? "已领过奖励" : "+\(xp) XP").duoNumeral(.subhead)
            }
            .foregroundStyle(DuoColors.secondary)
            .padding(.horizontal, 16).padding(.vertical, 9)
            .background(DuoColors.secondary.opacity(0.14), in: .capsule)

            Spacer()
          }
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LearningActionDock {
                Button("完成") { dismiss() }.buttonStyle(ChunkyButtonStyle(.primary))
                    .accessibilityIdentifier("story-result-done")
            }
        }
        .onAppear {
            guard !awarded else { return }
            // completeReading 内部按 id 幂等 —— 二刷不再发 XP。
            if !alreadyDone {
                awarded = true
                progressStore.completeReading(id: storyRewardId, xp: xp)
            }
            SFXEngine.shared.play(.complete); HapticEngine.shared.success()
        }
    }

    // MARK: - Adapter

    /// Adapt a StoryQuestion into the lesson Question type so the shared
    /// renderer + grader can drive it.
    static func question(from q: StoryQuestion) -> Question {
        let type: QuestionType
        switch q.type {
        case "true_false": type = .trueFalse
        case "choice":     type = .choice
        default:            type = .fillBlankText
        }
        return Question(
            id: q.id, type: type, score: 1, difficulty: 1, knowledgePoint: "",
            question: q.question, options: q.options, answer: q.answer,
            explanation: q.explanation, audio: q.audio
        )
    }
}
