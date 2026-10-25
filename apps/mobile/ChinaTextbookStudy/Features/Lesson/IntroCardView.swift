import SwiftUI

/// 课前知识讲解（content-2）—— web IntroCard 的 SwiftUI 移植。
///
/// 多邻国 Tips 风格的分步讲解：每屏只讲一件事
/// （core_concept / key_formula / common_mistakes / tips），
/// 聪聪 + 气泡 + TTS 音频 + 进度点 + 最后一页「开始做题」CTA。
/// 缺字段的页自动跳过；知识点全空时直接进题目。
struct IntroCardView: View {
    let lesson: Lesson
    let knowledge: KnowledgeSummary
    let onStart: () -> Void
    let onExit: () -> Void

    private enum Tone { case concept, rule, mistake, tip }

    private struct Page: Identifiable {
        let id: Int
        let tone: Tone
        let title: String
        let icon: String
        let accent: Color
        let mood: MascotMood
        let bubble: String
        /// 本页按顺序自动播的 TTS 音频段。
        let audioPaths: [String?]
        /// 标题旁 TTSButton 的代表音频（多段页留空避免重复）。
        let titleAudio: String?
    }

    private var pages: [Page] {
        var result: [Page] = []
        if !knowledge.coreConcept.isEmpty {
            result.append(Page(
                id: result.count, tone: .concept, title: "这是什么？",
                icon: "book.fill", accent: DuoColors.secondary,
                mood: .think, bubble: "一起学！",
                audioPaths: [knowledge.audio?.coreConcept],
                titleAudio: knowledge.audio?.coreConcept
            ))
        }
        if !knowledge.keyFormula.isEmpty {
            result.append(Page(
                id: result.count, tone: .rule, title: "记住这个！",
                icon: "target", accent: DuoColors.primary,
                mood: .wave, bubble: "超级重要!",
                audioPaths: [knowledge.audio?.keyFormula],
                titleAudio: knowledge.audio?.keyFormula
            ))
        }
        if !knowledge.commonMistakes.isEmpty {
            result.append(Page(
                id: result.count, tone: .mistake, title: "小心这些坑！",
                icon: "xmark.circle.fill", accent: DuoColors.danger,
                mood: .surprise, bubble: "别踩坑哦!",
                audioPaths: knowledge.audio?.commonMistakes ?? [],
                titleAudio: nil
            ))
        }
        if !knowledge.tips.isEmpty {
            result.append(Page(
                id: result.count, tone: .tip, title: "学习小妙招",
                icon: "bolt.fill", accent: DuoColors.bee,
                mood: .cheer, bubble: "你最棒!",
                audioPaths: [knowledge.audio?.tips],
                titleAudio: knowledge.audio?.tips
            ))
        }
        return result
    }

    @State private var pageIdx = 0
    @State private var mascotReactKey = 0

    @ObservedObject private var settings = SettingsStore.shared
    @ObservedObject private var audioPlayer = AudioPlayer.shared

    private var isLast: Bool { pageIdx >= pages.count - 1 }

    var body: some View {
        let all = pages
        Group {
            if all.isEmpty {
                // 异常保护：知识点全空就直接开始做题。
                Color.clear.onAppear { onStart() }
            } else {
                content(pages: all, current: all[min(pageIdx, all.count - 1)])
            }
        }
        .background(DuoColors.bg.ignoresSafeArea())
        .onAppear { enterPage(all.first) }
        .onDisappear { audioPlayer.stop() }
    }

    @ViewBuilder
    private func content(pages all: [Page], current: Page) -> some View {
        VStack(spacing: 0) {
            header(pages: all, current: current)

            // 单元 & 课程标题（小）
            VStack(spacing: 2) {
                Text("第 \(lesson.unitNumber) 单元 · \(lesson.unitTitle)")
                    .duoFont(.micro)
                    .tracking(1)
                    .foregroundStyle(DuoColors.inkSofter)
                Text(lesson.title)
                    .duoFont(.subhead)
                    .foregroundStyle(DuoColors.inkMuted)
                    .lineLimit(1)
            }
            .padding(.top, 8)
            .padding(.horizontal, 20)

            // 主内容：单页聚焦
            ScrollView {
                VStack(spacing: 16) {
                    // 吉祥物 + 气泡
                    HStack(alignment: .bottom, spacing: 8) {
                        MascotView(mood: current.mood, size: 84, reactTo: .levelup, reactKey: mascotReactKey)
                        SpeechBubbleView(text: current.bubble, mood: current.mood)
                            .padding(.bottom, 14)
                    }
                    .padding(.top, 12)

                    // 图标徽章
                    ZStack {
                        Circle()
                            .fill(current.accent.opacity(0.15))
                            .frame(width: 76, height: 76)
                        Image(systemName: current.icon)
                            .font(.system(size: 34, weight: .heavy))
                            .foregroundStyle(current.accent)
                    }

                    // 标题 + 代表音频
                    HStack(spacing: 10) {
                        Text(current.title)
                            .duoFont(.title)
                            .foregroundStyle(DuoColors.ink)
                        if let titleAudio = current.titleAudio {
                            TTSButton(path: titleAudio)
                        }
                    }

                    pageBody(current)
                        .padding(.horizontal, 24)
                        .padding(.bottom, 24)
                }
                .frame(maxWidth: .infinity)
            }

            footer(pages: all)
        }
    }

    // MARK: - 顶栏：关闭 + 进度点

    private func header(pages all: [Page], current: Page) -> some View {
        HStack(spacing: 12) {
            Button {
                HapticEngine.shared.tap()
                onExit()
            } label: {
                Image(systemName: "xmark")
                    .font(.system(size: 20, weight: .black))
                    .foregroundStyle(DuoColors.inkMuted)
                    .frame(width: 44, height: 44)
            }
            .accessibilityLabel("退出课程")

            HStack(spacing: 6) {
                ForEach(all) { p in
                    Capsule()
                        .fill(p.id <= pageIdx ? p.accent : DuoColors.surfaceAlt)
                        .frame(width: p.id == pageIdx ? 24 : 8, height: 8)
                        .animation(Motion.bounce, value: pageIdx)
                }
            }
            .frame(maxWidth: .infinity)

            Text("\(pageIdx + 1)/\(all.count)")
                .duoNumeral(.caption)
                .foregroundStyle(DuoColors.inkSofter)
                .frame(width: 40, alignment: .trailing)
        }
        .padding(.horizontal, 18)
        .padding(.top, 6)
        .padding(.bottom, 8)
        .overlay(alignment: .bottom) {
            Rectangle().fill(DuoColors.border).frame(height: 1)
        }
    }

    // MARK: - 每页内容

    @ViewBuilder
    private func pageBody(_ page: Page) -> some View {
        switch page.tone {
        case .concept:
            Text(MathText.render(knowledge.coreConcept))
                .duoFont(.subhead, weight: .medium)
                .foregroundStyle(DuoColors.ink)
                .lineSpacing(6)
                .multilineTextAlignment(.center)
        case .rule:
            Text(MathText.render(knowledge.keyFormula))
                .duoFont(.heading)
                .foregroundStyle(DuoColors.ink)
                .lineSpacing(6)
                .multilineTextAlignment(.center)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 20)
                .padding(.horizontal, 16)
                .background(DuoColors.surfaceAlt, in: .rect(cornerRadius: Radius.card))
                .overlay {
                    RoundedRectangle(cornerRadius: Radius.card)
                        .strokeBorder(DuoColors.border, lineWidth: 2)
                }
        case .mistake:
            VStack(spacing: 10) {
                ForEach(Array(knowledge.commonMistakes.enumerated()), id: \.offset) { i, mistake in
                    HStack(alignment: .top, spacing: 10) {
                        Image(systemName: "xmark.circle.fill")
                            .font(.system(size: 18, weight: .heavy))
                            .foregroundStyle(DuoColors.danger)
                            .padding(.top, 2)
                        Text(MathText.render(mistake))
                            .duoFont(.body)
                            .foregroundStyle(DuoColors.ink)
                            .lineSpacing(4)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        TTSButton(path: mistakeAudio(at: i), size: 15)
                    }
                    .padding(12)
                    .background(DuoColors.danger.opacity(0.07), in: .rect(cornerRadius: Radius.card))
                    .overlay {
                        RoundedRectangle(cornerRadius: Radius.card)
                            .strokeBorder(DuoColors.danger.opacity(0.25), lineWidth: 2)
                    }
                }
            }
        case .tip:
            Text(MathText.render(knowledge.tips))
                .duoFont(.subhead, weight: .medium)
                .foregroundStyle(DuoColors.ink)
                .lineSpacing(6)
                .multilineTextAlignment(.center)
        }
    }

    private func mistakeAudio(at index: Int) -> String? {
        guard let list = knowledge.audio?.commonMistakes, index < list.count else { return nil }
        return list[index]
    }

    // MARK: - 底部：上一步 + 主按钮

    private func footer(pages all: [Page]) -> some View {
        LearningActionDock {
          HStack(spacing: 12) {
            if pageIdx > 0 {
                Button {
                    HapticEngine.shared.tap()
                    SFXEngine.shared.play(.tap)
                    withAnimation(Motion.bounce) { pageIdx -= 1 }
                    enterPage(all[pageIdx])
                } label: {
                    Image(systemName: "chevron.left")
                        .font(.system(size: 18, weight: .black))
                        .foregroundStyle(DuoColors.inkMuted)
                        .frame(width: 56, height: 50)
                        .background(DuoColors.surface, in: .rect(cornerRadius: Radius.card))
                        .overlay {
                            RoundedRectangle(cornerRadius: Radius.card)
                                .strokeBorder(DuoColors.border, lineWidth: 2)
                        }
                }
                .buttonStyle(.plain)
                .accessibilityLabel("上一步")
            }

            Button {
                if isLast {
                    // 从「学」过渡到「练」：多层反馈。
                    SFXEngine.shared.play(.unlock)
                    HapticEngine.shared.success()
                    audioPlayer.stop()
                    onStart()
                } else {
                    HapticEngine.shared.tap()
                    SFXEngine.shared.play(.tap)
                    withAnimation(Motion.bounce) { pageIdx += 1 }
                    enterPage(all[pageIdx])
                }
            } label: {
                Text(isLast ? "开始做题" : "下一步")
            }
            .buttonStyle(ChunkyButtonStyle(.primary))
            .accessibilityIdentifier(isLast ? "intro-start" : "intro-next")
        }
        }
    }

    // MARK: - 翻页副作用（吉祥物反应 + 自动朗读该页音频）

    private func enterPage(_ page: Page?) {
        guard let page else { return }
        mascotReactKey += 1
        SFXEngine.shared.play(.progressTick)
        guard settings.autoNarrate, !settings.isMuted else { return }
        let paths = page.audioPaths.compactMap { $0 }
        guard !paths.isEmpty else { return }
        audioPlayer.play(paths: paths, settings: settings)
    }
}
