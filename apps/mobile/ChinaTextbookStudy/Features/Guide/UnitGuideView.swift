import SwiftUI

/// 单元知识手册（Wave E2 / ios-path-5 收尾）：聚合该单元各课的 knowledge
/// 做左右滑卡片 —— 公式卡 + 常见坑 + 小妙招 + TTS 朗读。
/// 路径单元 banner 的指南图标按钮打开这里。
struct UnitGuideView: View {
    let bookId: String
    let unitNumber: Int

    private struct GuideCard: Identifiable {
        let id: String              // lessonId
        let lessonTitle: String
        let knowledge: KnowledgeSummary
    }

    @Environment(\.dismiss) private var dismiss
    @State private var cards: [GuideCard] = []
    @State private var unitTitle = ""
    @State private var unitLabel: String?
    @State private var loaded = false
    @State private var pageIdx = 0

    @ObservedObject private var audioPlayer = AudioPlayer.shared

    var body: some View {
        Group {
            if !loaded {
                ProgressView().tint(DuoColors.primary)
            } else if cards.isEmpty {
                emptyState
            } else {
                content
            }
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(DuoColors.bg.ignoresSafeArea())
        .navigationTitle("\(unitLabel ?? "第 \(unitNumber) 单元") · 知识手册")
        .navigationBarTitleDisplayMode(.inline)
        .task { load() }
        .onDisappear { audioPlayer.stop() }
    }

    // MARK: - Content

    private var content: some View {
        VStack(spacing: 0) {
            if !unitTitle.isEmpty {
                Text(unitTitle)
                    .duoFont(.subhead)
                    .foregroundStyle(DuoColors.inkMuted)
                    .lineLimit(1)
                    .padding(.top, 10)
                    .padding(.horizontal, 20)
            }

            TabView(selection: $pageIdx) {
                ForEach(Array(cards.enumerated()), id: \.element.id) { i, card in
                    cardView(card, index: i)
                        .tag(i)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .onChange(of: pageIdx) { _, _ in
                HapticEngine.shared.tap()
                audioPlayer.stop()
            }

        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            LearningActionDock {
                HStack(spacing: 12) {
                    Button("上一课") { withAnimation(Motion.reveal) { pageIdx -= 1 } }
                        .buttonStyle(ChunkyButtonStyle(pageIdx == 0 ? .disabled : .ghost)).disabled(pageIdx == 0)
                        .accessibilityIdentifier("guide-previous")
                    Text("\(pageIdx + 1)/\(cards.count)").duoNumeral(.caption).foregroundStyle(DuoColors.inkMuted).fixedSize()
                    Button(pageIdx + 1 == cards.count ? "完成" : "下一课") {
                        if pageIdx + 1 == cards.count { dismiss() }
                        else { withAnimation(Motion.reveal) { pageIdx += 1 } }
                    }
                    .buttonStyle(ChunkyButtonStyle(.primary)).accessibilityIdentifier("guide-next")
                }
            }
        }
    }

    @ViewBuilder
    private func cardView(_ card: GuideCard, index: Int) -> some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 16) {
                // 知识点标题
                HStack(spacing: 10) {
                    Text("\(index + 1)")
                        .duoNumeral(.subhead)
                        .foregroundStyle(.white)
                        .frame(width: 32, height: 32)
                        .background(DuoColors.primary, in: .circle)
                    Text(card.knowledge.point.isEmpty ? card.lessonTitle : card.knowledge.point)
                        .duoFont(.heading)
                        .foregroundStyle(DuoColors.ink)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    TTSButton(path: card.knowledge.audio?.point, size: 16)
                }

                if !card.knowledge.coreConcept.isEmpty {
                    section(
                        title: "这是什么？",
                        icon: "book.fill",
                        tint: DuoColors.secondary,
                        audio: card.knowledge.audio?.coreConcept
                    ) {
                        Text(MathText.render(card.knowledge.coreConcept))
                            .duoFont(.body)
                            .foregroundStyle(DuoColors.ink)
                            .lineSpacing(5)
                    }
                }

                if !card.knowledge.keyFormula.isEmpty {
                    // 公式卡：居中大字，最醒目的一块。
                    VStack(spacing: 8) {
                        HStack(spacing: 6) {
                            Image(systemName: "target")
                                .font(.system(size: 14, weight: .heavy))
                            Text("记住这个！")
                                .duoFont(.caption)
                            TTSButton(path: card.knowledge.audio?.keyFormula, size: 13)
                        }
                        .foregroundStyle(DuoColors.primary)
                        Text(MathText.render(card.knowledge.keyFormula))
                            .duoFont(.heading)
                            .foregroundStyle(DuoColors.ink)
                            .lineSpacing(6)
                            .multilineTextAlignment(.center)
                    }
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 18)
                    .padding(.horizontal, 14)
                    .background(DuoColors.correctFill, in: .rect(cornerRadius: Radius.card))
                    .overlay {
                        RoundedRectangle(cornerRadius: Radius.card)
                            .strokeBorder(DuoColors.correctBorder, lineWidth: 2)
                    }
                }

                if !card.knowledge.commonMistakes.isEmpty {
                    section(
                        title: "小心这些坑！",
                        icon: "xmark.circle.fill",
                        tint: DuoColors.danger,
                        audio: nil
                    ) {
                        VStack(alignment: .leading, spacing: 8) {
                            ForEach(Array(card.knowledge.commonMistakes.enumerated()), id: \.offset) { i, mistake in
                                HStack(alignment: .top, spacing: 8) {
                                    Image(systemName: "xmark.circle.fill")
                                        .font(.system(size: 14, weight: .heavy))
                                        .foregroundStyle(DuoColors.danger)
                                        .padding(.top, 3)
                                    Text(MathText.render(mistake))
                                        .duoFont(.body)
                                        .foregroundStyle(DuoColors.ink)
                                        .lineSpacing(4)
                                        .frame(maxWidth: .infinity, alignment: .leading)
                                    TTSButton(path: mistakeAudio(card, at: i), size: 14)
                                }
                            }
                        }
                    }
                }

                if !card.knowledge.tips.isEmpty {
                    section(
                        title: "学习小妙招",
                        icon: "bolt.fill",
                        tint: DuoColors.bee,
                        audio: card.knowledge.audio?.tips
                    ) {
                        Text(MathText.render(card.knowledge.tips))
                            .duoFont(.body)
                            .foregroundStyle(DuoColors.ink)
                            .lineSpacing(5)
                    }
                }
            }
            .padding(18)
            .background(DuoColors.surface, in: .rect(cornerRadius: Radius.large))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.large)
                    .strokeBorder(DuoColors.border, lineWidth: 2)
            }
            .frame(maxWidth: LearningLayout.contentWidth - 40)
            .padding(.horizontal, 20)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
        }
        .accessibilityIdentifier("guide-card-\(card.id)")
    }

    @ViewBuilder
    private func section<Content: View>(
        title: String,
        icon: String,
        tint: Color,
        audio: String?,
        @ViewBuilder content: () -> Content
    ) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack(spacing: 6) {
                Image(systemName: icon)
                    .font(.system(size: 14, weight: .heavy))
                    .foregroundStyle(tint)
                Text(title)
                    .duoFont(.caption)
                    .foregroundStyle(tint)
                TTSButton(path: audio, size: 13)
            }
            content()
        }
    }

    private func mistakeAudio(_ card: GuideCard, at index: Int) -> String? {
        guard let list = card.knowledge.audio?.commonMistakes, index < list.count else { return nil }
        return list[index]
    }

    private var emptyState: some View {
        VStack(spacing: 14) {
            MascotView(mood: .think, size: 100)
            Text("这个单元还没有知识讲解")
                .duoFont(.subhead)
                .foregroundStyle(DuoColors.ink)
            Text("直接去做题也一样棒！")
                .duoFont(.caption)
                .foregroundStyle(DuoColors.inkMuted)
        }
        .padding(24)
    }

    // MARK: - Data

    private func load() {
        defer { loaded = true }
        guard let outline = try? DataLoader.shared.loadOutline(bookId: bookId),
              let unit = outline.units.first(where: { $0.unitNumber == unitNumber })
        else { return }
        unitTitle = unit.title
        unitLabel = unit.label
        cards = outline
            .pathLessonMetas(bookId: bookId)
            .filter { $0.unitNumber == unitNumber }
            .compactMap { meta in
                guard let lesson = try? DataLoader.shared.loadLesson(bookId: bookId, lessonId: meta.id),
                      let knowledge = lesson.knowledge
                else { return nil }
                return GuideCard(id: meta.id, lessonTitle: meta.title, knowledge: knowledge)
            }
    }
}
