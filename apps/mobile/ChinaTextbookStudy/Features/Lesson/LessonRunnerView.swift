import SwiftUI

/// Duolingo-faithful lesson runner:
///
/// - **Top**: [X] [green progress bar] [❤️ N]
/// - **Instruction**: bold text like "判断对错" / "选择正确答案"
/// - **Question**: text + TTS button
/// - **Options**: Duolingo option cards
/// - **Bottom**: green chunky "检查" button → colored feedback panel with mascot
///
/// The progress bar advances **only on correct answers**, and wrong questions are
/// re-queued to the end so the bar always completes and mistakes get re-practiced.
struct LessonRunnerView: View {
    let bookId: String
    let lessonId: String
    @ObservedObject var progressStore: ProgressStore
    @Binding var path: [AppRoute]

    @State private var lesson: Lesson?
    @State private var loadError: String?

    // Runner state — `queue` grows when a wrong answer is re-queued.
    @State private var queue: [Question] = []
    @State private var index: Int = 0
    @State private var phase: QuestionPhase = .answering
    @State private var currentAnswer: String = ""
    @State private var isCorrect: Bool? = nil
    @State private var solvedIDs: Set<Int> = []
    @State private var missedIDs: Set<Int> = []
    @State private var combo: Int = 0
    @State private var maxCombo: Int = 0
    @State private var attemptedThisQuestion = false

    // Session persistence (ios-lesson-3 / parity-13)
    /// 本会话内累计展示过的 XP（恢复时接着累计；结算以 store 计算为准）。
    @State private var sessionXp = 0
    /// ISO8601 开始时间 —— 恢复会话时沿用原会话的时间。
    @State private var sessionStartedAt = ISO8601DateFormatter().string(from: Date())
    /// 检测到可恢复的挂起会话时弹「继续上次 / 重新开始」。
    @State private var pendingResume: ActiveLessonSession?

    // Feedback presentation
    @State private var mascotMood: MascotMood = .happy
    @State private var feedbackReaction: MascotReaction? = nil
    @State private var feedbackBubble: String = ""
    @State private var feedbackTitleText: String = ""
    @State private var showCombo = false
    @State private var comboDisplayValue = 0
    @State private var xpFloaters: [XPFloatItem] = []

    // Gates & effects
    @State private var showQuitConfirm = false
    @State private var showOutOfHearts = false
    @State private var wrongFlash = 0
    @State private var showLessonSettings = false
    /// 课前知识讲解（content-2）：该课未完成且没看过讲解时先进分步讲解。
    @State private var showIntro = false
    /// 题目报错小旗子（Wave E2）：反馈面板 → 三选弹层。
    @State private var showReportSheet = false
    /// 报错弹层里已提交的类型（打勾反馈）。
    @State private var reportedKind: QuestionReport.Kind?

    /// 掉心延迟(ios-lesson-15):答错后 heartLoss 音/触感与 `loseHeart()` 一起
    /// 延迟 0.4s。期间用户就点了「知道了」的话,`proceed` 用它把还没落账的
    /// 红心算进去,避免 0 心还能继续。
    ///
    /// 必须是**计数器**而不是布尔(ioslesson-1):连续两次快答错时,第一个
    /// 延迟闭包会把布尔清成 false,第二颗还没落账的心就凭空消失了,断心闸门
    /// 因此漏算。计数器只做 +1 / -1,几笔悬账都能算准。
    @State private var pendingHeartLosses = 0

    @Environment(\.accessibilityReduceMotion) private var reduceMotion
    @ObservedObject private var settings = SettingsStore.shared
    @ObservedObject private var audioPlayer = AudioPlayer.shared

    private struct XPFloatItem: Identifiable { let id = UUID(); let amount: Int }
    enum QuestionPhase { case answering, checked }

    private var originalTotal: Int { max(1, lesson?.questions.count ?? 1) }
    private var progress: Double { Double(solvedIDs.count) / Double(originalTotal) }

    /// 单元挑战课（"{bookId}-u{n}-exam"）：XP ×2，头部亮「⚔️ 单元挑战」徽章。
    private var isExamLesson: Bool { Economy.isExamLessonId(lessonId) }

    /// The equipped lesson backdrop, laid over the neutral surface at a reduced
    /// strength so question text keeps its contrast on every backdrop.
    @ViewBuilder
    private var lessonBackground: some View {
        ZStack {
            DuoColors.bg
            if let b = progressStore.equippedBackdropData, !b.stops.isEmpty {
                LinearGradient(colors: b.stops, startPoint: .top, endPoint: .bottom)
                    .opacity(b.needsOverlay ? 0.26 : 0.55)
            }
        }
    }

    var body: some View {
        Group {
            if showIntro, let lesson, let knowledge = lesson.knowledge {
                // 课前知识讲解（content-2）：先学一步步的小讲解，再进题目。
                IntroCardView(
                    lesson: lesson,
                    knowledge: knowledge,
                    onStart: {
                        progressStore.markIntroSeen(lessonId)
                        withAnimation(.easeOut(duration: 0.25)) { showIntro = false }
                    },
                    onExit: { path.removeLast() }
                )
            } else if lesson != nil, index < queue.count {
                runner(question: queue[index])
            } else if let loadError {
                VStack(spacing: Space.m) {
                    Text("加载失败").duoFont(.heading)
                    Text(loadError).duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                }
                .padding()
            } else {
                ProgressView().tint(DuoColors.primary)
            }
        }
        .navigationBarHidden(true)
        .task { load() }
        .onDisappear { audioPlayer.stop() }
    }

    @ViewBuilder
    private func runner(question q: Question) -> some View {
        VStack(spacing: 0) {
            header
            sessionSummary
            content(q: q)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(lessonBackground.ignoresSafeArea())
        .safeAreaInset(edge: .bottom, spacing: 0) {
            if phase == .checked, let ok = isCorrect {
                feedbackPanel(ok: ok, question: q)
            } else {
                checkFooter(question: q)
            }
        }
        .overlay { floaters }
        .overlay { comboOverlay }
        .overlay { if !reduceMotion { FullScreenFlash(color: DuoColors.danger, trigger: wrongFlash) } }
        .overlay { if showOutOfHearts { outOfHeartsGate } }
        .overlay { if showQuitConfirm { quitConfirmOverlay } }
        .overlay { if pendingResume != nil { resumePromptOverlay } }
        .sheet(isPresented: $showLessonSettings) { lessonSettingsSheet }
        .sheet(isPresented: $showReportSheet, onDismiss: { reportedKind = nil }) {
            reportSheet(question: q)
        }
    }

    // MARK: - Header: [X] [progress] [❤️]

    private var header: some View {
        HStack(spacing: 14) {
            Button {
                // 零进度（一道题都没答过）直接退出不弹挽留 —— 对齐 web。
                if phase == .checked || !solvedIDs.isEmpty || !missedIDs.isEmpty {
                    HapticEngine.shared.tap()
                    withAnimation(.easeOut(duration: 0.2)) { showQuitConfirm = true }
                } else {
                    path.removeLast()
                }
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 20, weight: .black))
                    .foregroundStyle(DuoColors.inkMuted)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("关闭")

            StyledProgressBar(progress: progress, height: 16, trackColor: DuoColors.surfaceAlt)
                .accessibilityLabel("本课进度")
                .accessibilityValue("已掌握 \(solvedIDs.count) 题，共 \(originalTotal) 题")

            // 单元挑战徽章：双倍 XP 生效中，必须让孩子看见。
            if isExamLesson && !Economy.isWeekend() {
                HStack(spacing: 2) {
                    Text("⚔️")
                        .font(.system(size: 11))
                    Text("×2")
                        .font(.system(size: 13, weight: .black))
                        .monospacedDigit()
                }
                .foregroundStyle(DuoColors.beetle)
                .padding(.horizontal, 7)
                .padding(.vertical, 4)
                .background(DuoColors.beetle.opacity(0.16), in: .capsule)
                .accessibilityLabel("单元挑战双倍经验")
                .accessibilityIdentifier("exam-badge")
            }

            // Weekend ×2 XP must be visible while it applies — small honest badge.
            if Economy.isWeekend() && !isExamLesson {
                HStack(spacing: 2) {
                    Image(systemName: "bolt.fill")
                        .font(.system(size: 11, weight: .heavy))
                    Text("×2")
                        .font(.system(size: 13, weight: .black))
                        .monospacedDigit()
                }
                .foregroundStyle(DuoColors.bee)
                .padding(.horizontal, 7)
                .padding(.vertical, 4)
                .background(DuoColors.bee.opacity(0.16), in: .capsule)
                .accessibilityLabel("周末双倍经验")
            }

            HStack(spacing: 3) {
                Image(systemName: "heart.fill")
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(progressStore.hearts > 0 ? DuoColors.danger : DuoColors.inkSofter)
                    // Reduce Motion:value 恒定 → 永不触发 bounce。
                    .symbolEffect(.bounce, value: reduceMotion ? 0 : progressStore.hearts)
                Text("\(progressStore.hearts)")
                    .duoNumeral(.body)
                    .foregroundStyle(progressStore.hearts > 0 ? DuoColors.danger : DuoColors.inkSofter)
            }
            .accessibilityIdentifier("lesson-hearts")

            // 课内快捷设置：音效 / 触感 / 自动朗读（ios-lesson-14）。
            Button {
                HapticEngine.shared.tap()
                showLessonSettings = true
            } label: {
                Image(systemName: "gearshape.fill")
                    .font(.system(size: 17, weight: .heavy))
                    .foregroundStyle(DuoColors.inkSofter)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("课堂设置")
            .accessibilityIdentifier("lesson-settings")
        }
        .padding(.horizontal, 12)
        .padding(.top, 6)
        .padding(.bottom, 10)
    }

    private var sessionSummary: some View {
        HStack(alignment: .top, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                Text(isExamLesson ? "单元挑战 · 双倍经验" : "聪聪陪你练")
                    .duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                Text(lesson?.title ?? "课堂练习")
                    .duoFont(.subhead).foregroundStyle(DuoColors.ink)
                    .lineLimit(2)
            }
            Spacer(minLength: 0)
            Text("\(solvedIDs.count) / \(originalTotal)")
                .duoNumeral(.caption).foregroundStyle(DuoColors.inkMuted)
                .padding(.horizontal, 10).padding(.vertical, 7)
                .background(DuoColors.surfaceAlt, in: Capsule())
                .accessibilityLabel("已掌握 \(solvedIDs.count) 题，共 \(originalTotal) 题")
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 12)
    }

    // MARK: - In-lesson settings sheet (ios-lesson-14)

    private var lessonSettingsSheet: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 18) {
                Text("课堂设置")
                    .duoFont(.heading)
                    .foregroundStyle(DuoColors.ink)
                    .padding(.top, 18)

                settingToggle(
                    icon: "speaker.wave.2.fill",
                    title: "音效",
                    subtitle: "答题反馈与庆祝的声音",
                    isOn: Binding(get: { !settings.isMuted }, set: { settings.isMuted = !$0 })
                )
                settingToggle(
                    icon: "iphone.radiowaves.left.and.right",
                    title: "触感振动",
                    subtitle: "答对答错时的轻微振动",
                    isOn: $settings.hapticEnabled
                )
                settingToggle(
                    icon: "text.bubble.fill",
                    title: "自动朗读",
                    subtitle: "进入新题目时自动朗读题干",
                    isOn: $settings.autoNarrate
                )

            }
            .learningContent()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LearningActionDock {
                Button("好了") { showLessonSettings = false }
                    .buttonStyle(ChunkyButtonStyle(.primary))
                    .accessibilityIdentifier("lesson-settings-done")
            }
        }
        .background(DuoColors.bg)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func settingToggle(icon: String, title: String, subtitle: String, isOn: Binding<Bool>) -> some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 20, weight: .heavy))
                .foregroundStyle(DuoColors.secondary)
                .frame(width: 30)
            VStack(alignment: .leading, spacing: 2) {
                Text(title).duoFont(.subhead).foregroundStyle(DuoColors.ink)
                Text(subtitle).duoFont(.micro).foregroundStyle(DuoColors.inkMuted)
            }
            Spacer()
            Toggle("", isOn: isOn)
                .labelsHidden()
                .tint(DuoColors.primary)
        }
        .padding(12)
        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.card)
                .strokeBorder(DuoColors.border, lineWidth: 2)
        }
    }

    // MARK: - Question content

    private func content(q: Question) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: Space.xl) {
                Text(instructionText(q.type))
                    .duoFont(.heading)
                    .foregroundStyle(DuoColors.ink)
                    .padding(.top, 6)

                HStack(alignment: .top, spacing: 10) {
                    Text(MathText.render(q.question))
                        .duoFont(.subhead, weight: .medium)
                        .foregroundStyle(DuoColors.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .lineSpacing(4)
                    TTSButton(path: q.audio?.question)
                }

                QuestionRendererView(
                    question: q,
                    answer: currentAnswer,
                    phase: phase,
                    isCorrect: isCorrect,
                    onChange: { currentAnswer = $0 }
                )
                .id("\(q.id)-\(index)")
            }
            .padding(.horizontal, 20)
            .frame(maxWidth: LearningLayout.contentWidth)
            .frame(maxWidth: .infinity)
            .padding(.bottom, 24)
        }
        .onChange(of: index) { _, _ in autoNarrate(q) }
        .onAppear { autoNarrate(q) }
    }

    // MARK: - Overlays

    @ViewBuilder private var floaters: some View {
        ForEach(xpFloaters) { f in
            XPFloaterView(amount: f.amount) { xpFloaters.removeAll { $0.id == f.id } }
        }
    }

    @ViewBuilder private var comboOverlay: some View {
        if showCombo {
            ComboOverlayView(combo: comboDisplayValue)
                .onAppear {
                    DispatchQueue.main.asyncAfter(deadline: .now() + 1.5) { showCombo = false }
                }
        }
    }

    // MARK: - Instruction text

    private func instructionText(_ type: QuestionType) -> String {
        switch type {
        case .trueFalse:     return "判断对错"
        case .choice:        return "选择正确答案"
        case .fillBlank:     return "填写答案"
        case .calculation:   return "计算结果"
        case .fillBlankText: return "填写答案"
        case .wordOrder:     return "组成正确的句子"
        case .matching:      return "将配对连线"
        case .wordProblem:   return "解答应用题"
        }
    }

    // MARK: - Feedback panel (mascot + accent title + big CTA)

    private func feedbackPanel(ok: Bool, question: Question) -> some View {
        LearningFeedbackPanel(
            correct: ok, title: feedbackTitleText.isEmpty ? (ok ? "正确" : "再学会一点") : feedbackTitleText,
            answer: question.answer, message: feedbackBubble,
            explanation: question.explanation, audio: question.audio?.explanation,
            buttonTitle: ok ? "继续" : "知道了", mood: mascotMood,
            reaction: feedbackReaction, reactionKey: index + 1,
            onReport: { HapticEngine.shared.tap(); showReportSheet = true },
            onContinue: { proceed(question: question) }
        )
    }

    // MARK: - Report sheet (Wave E2 小旗子)

    /// 三选报错弹层。选中即写入本地 reports 列表（不上传），打勾致谢后自动收起。
    private func reportSheet(question: Question) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 10) {
                    Image(systemName: "flag.fill")
                        .font(.system(size: 20, weight: .heavy))
                        .foregroundStyle(DuoColors.fox)
                    Text("这道题怎么了？")
                        .duoFont(.heading)
                        .foregroundStyle(DuoColors.ink)
                }
                .padding(.top, 18)

                Text("你的反馈只保存在这台设备上，可在「设置」里查看。")
                    .duoFont(.micro)
                    .foregroundStyle(DuoColors.inkSofter)

                ForEach(QuestionReport.Kind.allCases, id: \.self) { kind in
                    Button {
                        submitReport(kind: kind, question: question)
                    } label: {
                        HStack(spacing: 12) {
                            Image(systemName: kind.symbol)
                                .font(.system(size: 18, weight: .heavy))
                                .foregroundStyle(reportedKind == kind ? DuoColors.primary : DuoColors.secondary)
                                .frame(width: 28)
                            Text(kind.label)
                                .duoFont(.subhead)
                                .foregroundStyle(DuoColors.ink)
                            Spacer()
                            if reportedKind == kind {
                                Image(systemName: "checkmark.circle.fill")
                                    .font(.system(size: 20, weight: .heavy))
                                    .foregroundStyle(DuoColors.primary)
                            }
                        }
                        .padding(14)
                        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
                        .overlay {
                            RoundedRectangle(cornerRadius: Radius.card)
                                .strokeBorder(
                                    reportedKind == kind ? DuoColors.primary : DuoColors.border,
                                    lineWidth: 2
                                )
                        }
                    }
                    .buttonStyle(.plain)
                    .disabled(reportedKind != nil)
                    .accessibilityIdentifier("report-\(kind.rawValue)")
                }

                if reportedKind != nil {
                    Text("已记录，谢谢小侦探！🕵️")
                        .duoFont(.caption)
                        .foregroundStyle(DuoColors.primary)
                        .frame(maxWidth: .infinity, alignment: .center)
                        .transition(.scale.combined(with: .opacity))
                }

            }
            .learningContent()
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LearningActionDock {
                Button("取消") { showReportSheet = false }
                    .buttonStyle(ChunkyButtonStyle(.ghost))
                    .accessibilityIdentifier("report-dismiss")
            }
        }
        .background(DuoColors.bg)
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
    }

    private func submitReport(kind: QuestionReport.Kind, question: Question) {
        _ = progressStore.addReport(
            lessonId: lessonId,
            questionId: question.id,
            kind: kind,
            userAnswer: currentAnswer,
            questionText: question.question
        )
        HapticEngine.shared.success()
        SFXEngine.shared.play(.tap)
        withAnimation(Motion.bounce) { reportedKind = kind }
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.9) {
            showReportSheet = false
        }
    }

    // MARK: - Check footer

    private func checkFooter(question: Question) -> some View {
        let empty = currentAnswer.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
        return LearningActionDock {
            Button("检查答案") { check(question: question) }
                .buttonStyle(ChunkyButtonStyle(empty ? .disabled : .primary))
                .disabled(empty).accessibilityIdentifier("检查答案")
        }
    }

    // MARK: - Out-of-hearts gate

    private var outOfHeartsGate: some View {
        OutOfHeartsGate(
            progressStore: progressStore,
            onRefill: {
                if progressStore.buyHeartRefill(cost: Economy.heartRefillCost) {
                    HapticEngine.shared.success()
                    SFXEngine.shared.play(.purchase)   // 宝石消费统一走收银双音(ios-feel-12)
                    showOutOfHearts = false
                    advance()
                } else {
                    HapticEngine.shared.wrong()
                }
            },
            // 断心闭环（ios-lesson-7）：去错题本做一组复习赚回 1 颗心。
            // 会话已持久化 —— 复习完回到这节课会从当前题目继续。
            onReview: {
                HapticEngine.shared.tap()
                path.removeLast()
                path.append(.reviewRunner)
            },
            onQuit: { path.removeLast() }   // 被迫退出：保留会话，回来可续
        )
        .transition(.opacity)
    }

    // MARK: - Quit confirm overlay (ios-lesson-13 / ios-feel-7)

    /// 自绘退出挽留：难过的聪聪 + 主按钮「继续学习」置顶。零进度时根本
    /// 不会走到这里（header 直接退出）。
    private var quitConfirmOverlay: some View {
        LearningDialog(onDismiss: { showQuitConfirm = false }) {
            VStack(spacing: 16) {
                MascotView(mood: .think, size: 92)
                Text("再坚持一下，快完成了！").duoFont(.heading).foregroundStyle(DuoColors.ink)
                Text("已答对 \(solvedIDs.count) / \(originalTotal) 题，现在放弃太可惜啦")
                    .duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
            }.multilineTextAlignment(.center)
        } actions: {
            VStack(spacing: 10) {
                Button("继续学习") { HapticEngine.shared.tap(); showQuitConfirm = false }
                    .buttonStyle(ChunkyButtonStyle(.primary))
                Button("退出") { progressStore.clearLessonSession(); path.removeLast() }
                    .buttonStyle(ChunkyButtonStyle(.ghost)).accessibilityIdentifier("lesson-quit")
            }
        }
    }

    // MARK: - Resume prompt overlay (ios-lesson-3)

    /// 进入同一课检测到挂起会话时的选择层：继续上次 or 重新开始。
    private var resumePromptOverlay: some View {
        LearningDialog {
            VStack(spacing: 16) {
                MascotView(mood: .wave, size: 92)
                Text("上次学到一半哦").duoFont(.heading).foregroundStyle(DuoColors.ink)
                Text("已答对 \(pendingResume?.solvedIds.count ?? 0) / \(originalTotal) 题，接着做还是重新来？")
                    .duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
            }.multilineTextAlignment(.center)
        } actions: {
            VStack(spacing: 10) {
                Button("继续上次（第 \((pendingResume?.solvedIds.count ?? 0) + 1) 题）") {
                    HapticEngine.shared.tap()
                    if let session = pendingResume { applyResume(session) }
                    pendingResume = nil
                }
                .buttonStyle(ChunkyButtonStyle(.primary)).accessibilityIdentifier("lesson-resume")
                Button("重新开始") { progressStore.clearLessonSession(); pendingResume = nil }
                    .buttonStyle(ChunkyButtonStyle(.ghost)).accessibilityIdentifier("lesson-restart")
            }
        }
    }

    private func autoNarrate(_ q: Question) {
        guard settings.autoNarrate, !settings.isMuted else { return }
        guard let path = q.audio?.question else { return }
        audioPlayer.play(path: path, settings: settings)
    }

    // MARK: - Actions

    private func check(question: Question) {
        let ok = Grade.gradeAnswer(question: question, userAnswer: currentAnswer)
        feedbackTitleText = pickTitle(ok: ok)

        withAnimation(Motion.reveal) {
            phase = .checked
            isCorrect = ok
        }

        if ok {
            solvedIDs.insert(question.id)
            combo += 1; maxCombo = max(maxCombo, combo)
            // 连对升调(ios-lesson-12):第 1 连对是基准音,之后每级约 +1 半音,
            // 引擎内封顶 8 级 —— 连对越长音越亮。correct 即刻播,不错峰。
            SFXEngine.shared.play(.correct, pitchStep: combo - 1)
            HapticEngine.shared.correct()
            // Per-correct XP floater — mirrors the real per-question rate,
            // doubled on weekends / in unit challenges so the promise matches
            // the payout (both stack, same as the settlement formula).
            let floatXp = Economy.xpPerCorrect
                * (isExamLesson ? Economy.examXpMultiplier : 1)
                * (Economy.isWeekend() ? Economy.weekendXpMultiplier : 1)
            sessionXp += floatXp
            xpFloaters.append(XPFloatItem(amount: floatXp))
            if [3, 5, 10].contains(combo) {
                // 反馈错峰(ios-feel-17):让 correct 音先落定,0.32s 后连击横幅
                // 带着自己的音效(ComboOverlayView.onAppear 播 .combo)再登场。
                let milestone = combo
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.32) {
                    comboDisplayValue = milestone
                    showCombo = true
                }
            }
        } else {
            attemptedThisQuestion = true
            missedIDs.insert(question.id)
            combo = 0
            queue.append(question)                       // re-practice later
            // 反馈错峰(ios-lesson-15):wrong 音 + error 触感即刻;
            // heartLoss 音 + heavy 触感延迟 0.4s,并把 loseHeart() 一起挪过去 ——
            // 红心图标的 symbolEffect(.bounce) 由 hearts 变化触发,这样掉心音、
            // 重触感、心数 bounce 三者同帧落地,而不是和 wrong 糊成一团。
            SFXEngine.shared.play(.wrong); HapticEngine.shared.wrong()
            if !reduceMotion { wrongFlash += 1 }         // 全屏闪红属强动效,Reduce Motion 下跳过
            pendingHeartLosses += 1
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.4) {
                progressStore.loseHeart()
                SFXEngine.shared.play(.heartLoss)
                HapticEngine.shared.heartLoss()
                pendingHeartLosses = max(0, pendingHeartLosses - 1)
            }
            progressStore.recordMistake(lessonId: lessonId, lessonTitle: lesson?.title, question: question)
        }

        // loseHeart() 被延迟了 0.4s,吉祥物的心数要按「悬账全部落定后」的值算
        // —— 快速连错时可能同时挂着不止一笔。
        let remainingHearts = max(0, progressStore.hearts - pendingHeartLosses)
        let ctx = MascotTriggerContext(
            isCorrect: ok,
            isPerfectSession: missedIDs.isEmpty,
            attemptCount: attemptedThisQuestion ? 2 : 1,
            remainingHearts: remainingHearts, combo: combo, maxCombo: maxCombo,
            index: solvedIDs.count, total: originalTotal, totalCorrectInSession: solvedIDs.count
        )
        mascotMood = MascotTriggers.decideMood(ctx)
        feedbackReaction = MascotTriggers.decideReaction(ctx)
        feedbackBubble = ok ? MascotTriggers.pickBubble(mood: mascotMood) : ""

        // 每次判定后立即落盘会话（ios-lesson-3）：App 被杀 / 断心退出后，
        // 下次进入同一课可从下一题无缝恢复。
        persistSession()
    }

    /// Persist the in-flight session. `queue[(index+1)...]` is the remaining
    /// queue as of "after this question" — a wrong answer already re-appended
    /// the question to the tail, so resuming never re-asks the front card.
    private func persistSession() {
        guard index + 1 <= queue.count else { return }
        let remaining = queue[(index + 1)...].map(\.id)
        // 全部答完（结算在即）就没有可恢复的会话了。
        guard solvedIDs.count < originalTotal, !remaining.isEmpty else { return }
        progressStore.upsertLessonSession(ActiveLessonSession(
            bookId: bookId,
            lessonId: lessonId,
            queueIds: Array(remaining),
            solvedIds: Array(solvedIDs).sorted(),
            missedIds: Array(missedIDs).sorted(),
            combo: combo,
            maxCombo: maxCombo,
            sessionXp: sessionXp,
            startedAt: sessionStartedAt
        ))
    }

    /// Restore runner state from a persisted session (resume path).
    private func applyResume(_ session: ActiveLessonSession) {
        guard let lesson else { return }
        let byId = Dictionary(uniqueKeysWithValues: lesson.questions.map { ($0.id, $0) })
        let restoredQueue = session.queueIds.compactMap { byId[$0] }
        // 课程内容更新导致队列失效 → 放弃恢复，从头来。
        guard !restoredQueue.isEmpty else {
            progressStore.clearLessonSession()
            return
        }
        queue = restoredQueue
        index = 0
        solvedIDs = Set(session.solvedIds).intersection(byId.keys)
        missedIDs = Set(session.missedIds).intersection(byId.keys)
        combo = session.combo
        maxCombo = session.maxCombo
        sessionXp = session.sessionXp
        sessionStartedAt = session.startedAt
        currentAnswer = ""
        isCorrect = nil
        phase = .answering
        attemptedThisQuestion = false
    }

    /// Called by the feedback panel's continue button. Gates on hearts.
    private func proceed(question: Question) {
        // 掉心账可能还悬在 0.4s 的延迟里(见 check),这里手动把**每一笔**都算
        // 进去,防止最后一颗红心「还没扣到界面上」时溜过断心闸门。
        let effectiveHearts = progressStore.hearts - pendingHeartLosses
        if !isCorrectValue && effectiveHearts <= 0 {
            withAnimation(.easeOut(duration: 0.2)) { showOutOfHearts = true }
            return
        }
        advance()
    }

    private var isCorrectValue: Bool { isCorrect ?? false }

    private func advance() {
        // progressTick 只在进度条真正前进(答对后的「继续」)时播(ios-lesson-20);
        // 答错后的「知道了」进度没动,只给轻触感。
        if isCorrectValue { SFXEngine.shared.play(.progressTick) }
        HapticEngine.shared.tap()
        guard let lesson else { return }
        if solvedIDs.count >= originalTotal || index + 1 >= queue.count {
            finish(lesson: lesson)
        } else {
            withAnimation(.easeInOut(duration: 0.2)) {
                index += 1
                currentAnswer = ""
                isCorrect = nil
                phase = .answering
                attemptedThisQuestion = false
            }
        }
    }

    private func finish(lesson: Lesson) {
        // 首答口径：missedIDs 记录的是「首答就错过」的题，correctCount = 首答答对数。
        let correctCount = originalTotal - missedIDs.count
        let outcome = progressStore.completeLesson(lessonId: lessonId, correctCount: correctCount, questionCount: originalTotal)
        let result = LessonRunResult(
            bookId: bookId, lessonId: lessonId, lessonTitle: lesson.title,
            questionCount: originalTotal, correctCount: correctCount, outcome: outcome
        )
        path.removeLast(); path.append(.lessonResult(result))
    }

    private func pickTitle(ok: Bool) -> String {
        let pool = ok
            ? ["太棒了！", "完美！", "做得好！", "天才！", "继续保持！", "漂亮！"]
            : ["答错了", "差一点", "加油", "没关系", "下次就对！"]
        return pool.randomElement() ?? (ok ? "正确" : "答错了")
    }

    private func load() {
        do {
            let l = try DataLoader.shared.loadLesson(bookId: bookId, lessonId: lessonId)
            self.lesson = l
            self.queue = l.questions
            // 检测挂起会话（ios-lesson-3）：有实际进度才值得弹恢复层。
            if let session = progressStore.activeSession(for: lessonId),
               !session.solvedIds.isEmpty || !session.missedIds.isEmpty {
                self.pendingResume = session
            }
            // 课前知识讲解（content-2）：该课未完成、没看过讲解、也没有挂起
            // 会话（恢复优先）时，先进分步讲解再做题。
            if pendingResume == nil,
               l.knowledge != nil,
               !progressStore.isLessonCompleted(lessonId),
               !progressStore.hasSeenIntro(lessonId) {
                self.showIntro = true
            }
        } catch {
            self.loadError = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
        }
    }
}

// MARK: - Out-of-hearts gate

/// Blocking modal shown when the learner runs out of hearts mid-lesson.
/// Offers a gem refill, a review path that earns back one heart
/// (ios-lesson-7), or an exit, plus a live recharge countdown.
private struct OutOfHeartsGate: View {
    @ObservedObject var progressStore: ProgressStore
    let onRefill: () -> Void
    let onReview: () -> Void
    let onQuit: () -> Void

    private let refillCost = Economy.heartRefillCost
    @State private var tick = Date()
    private let timer = Timer.publish(every: 1, on: .main, in: .common).autoconnect()

    private var hasDueMistakes: Bool { !progressStore.dueMistakes.isEmpty }

    var body: some View {
        LearningDialog(preferredHeight: 480) {
            VStack(spacing: 16) {
                Image(systemName: "heart.slash.fill").font(.system(size: 60, weight: .bold)).foregroundStyle(DuoColors.danger)
                Text("红心用完了").duoFont(.title).foregroundStyle(DuoColors.ink)
                if let next = progressStore.nextHeartAt {
                    Text("下一颗红心还需").duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
                    Text(countdown(to: next)).duoNumeral(.title).foregroundStyle(DuoColors.danger)
                }
                if hasDueMistakes {
                    Text("这节课已帮你记住进度，复习完回来接着学")
                        .duoFont(.caption).foregroundStyle(DuoColors.inkMuted).multilineTextAlignment(.center)
                }
            }
        } actions: {
            VStack(spacing: 10) {
                Button("用宝石补满  \(refillCost)", action: onRefill)
                    .buttonStyle(ChunkyButtonStyle(progressStore.gems >= refillCost ? .secondary : .disabled))
                    .disabled(progressStore.gems < refillCost)
                if hasDueMistakes {
                    Button("做一组复习回 1 颗红心", action: onReview).buttonStyle(ChunkyButtonStyle(.primary))
                        .accessibilityIdentifier("hearts-review-earnback")
                }
                Button("退出练习", action: onQuit).buttonStyle(ChunkyButtonStyle(.ghost))
            }
        }
        .onReceive(timer) { _ in tick = Date(); progressStore.tickHeartRecharge() }
    }

    private func countdown(to date: Date) -> String {
        let remaining = max(0, date.timeIntervalSince(tick))
        return String(format: "%d:%02d", Int(remaining) / 60, Int(remaining) % 60)
    }
}
