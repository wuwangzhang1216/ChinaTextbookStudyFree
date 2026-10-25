import SwiftUI

/// Shared compositions for the native app. Keep the learning canvas readable
/// on iPad, while allowing cards and labels to grow with Dynamic Type.
enum LearningLayout {
    static let contentWidth: CGFloat = 680
    static let pagePadding: CGFloat = 20
}

/// The only bottom action container used by activities, sheets and results.
/// Content respects the keyboard; only its background extends to the home indicator.
struct LearningActionDock<Content: View>: View {
    var background: Color = DuoColors.bg
    var showsDivider = true
    @ViewBuilder var content: Content

    var body: some View {
        content
            .frame(maxWidth: LearningLayout.contentWidth - 40)
            .padding(.horizontal, LearningLayout.pagePadding)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(background.ignoresSafeArea(.container, edges: .bottom))
            .overlay(alignment: .top) {
                if showsDivider { Rectangle().fill(DuoColors.border).frame(height: 1) }
            }
    }
}

/// Tall content scrolls independently from its pinned action, including at
/// accessibility font sizes and on the smallest supported iPhone.
struct LearningCelebrationBody<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        GeometryReader { geometry in
            ScrollView {
                content
                    .frame(width: min(LearningLayout.contentWidth - 40, max(0, geometry.size.width - 40)))
                    .frame(minHeight: max(0, geometry.size.height - 40))
                    .padding(20)
                    .frame(maxWidth: .infinity)
            }
        }
    }
}

/// A bounded native dialog: content can scroll, decisions stay visible.
/// Shared by quit/resume, daily gifts, heart gates and restore prompts.
struct LearningDialog<Content: View, Actions: View>: View {
    var preferredHeight: CGFloat = 420
    var onDismiss: (() -> Void)? = nil
    @ViewBuilder var content: Content
    @ViewBuilder var actions: Actions
    @Environment(\.dynamicTypeSize) private var typeSize

    var body: some View {
        GeometryReader { geometry in
            ZStack {
                Color.black.opacity(0.4).ignoresSafeArea().onTapGesture { onDismiss?() }
                VStack(spacing: 0) {
                    ScrollView { content.padding(24).frame(maxWidth: .infinity) }
                    LearningActionDock { actions }
                }
                .frame(width: min(360, max(0, geometry.size.width - 40)),
                       height: min(max(0, geometry.size.height - 40), preferredHeight * (typeSize.isAccessibilitySize ? 1.5 : 1)))
                .background(DuoColors.surface)
                .clipShape(RoundedRectangle(cornerRadius: Radius.large))
                .overlay { RoundedRectangle(cornerRadius: Radius.large).strokeBorder(DuoColors.border, lineWidth: 2) }
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
    }
}

struct LearningActivityHeader: View {
    let progress: Double
    let position: String
    var closeLabel = "关闭"
    var showsMute = false
    let onClose: () -> Void

    var body: some View {
        HStack(spacing: 12) {
            Button(action: onClose) {
                Image(systemName: "xmark").font(.system(size: 20, weight: .bold))
                    .foregroundStyle(DuoColors.inkMuted).frame(width: 44, height: 44)
            }
            .buttonStyle(.plain).accessibilityLabel(closeLabel)
            StyledProgressBar(progress: progress, height: 16, trackColor: DuoColors.surfaceAlt)
                .accessibilityLabel("学习进度").accessibilityValue(position)
            Text(position).duoNumeral(.caption).foregroundStyle(DuoColors.inkMuted)
                .lineLimit(1).fixedSize()
            if showsMute { MuteToggle().frame(width: 44, height: 44) }
        }
        .padding(.horizontal, 12).padding(.top, 6).padding(.bottom, 10)
    }
}

/// The same accepted pale-state feedback in lessons, stories, review and tests.
struct LearningFeedbackPanel: View {
    let correct: Bool
    let title: String
    var answer: String? = nil
    var message: String? = nil
    var explanation = ""
    var audio: String? = nil
    let buttonTitle: String
    var buttonIdentifier = "activity-continue"
    var mood: MascotMood? = nil
    var reaction: MascotReaction? = nil
    var reactionKey = 0
    var onReport: (() -> Void)? = nil
    let onContinue: () -> Void
    @AccessibilityFocusState private var focused: Bool

    private var accent: Color { correct ? DuoColors.successInk : DuoColors.errorInk }

    var body: some View {
        LearningActionDock(background: correct ? DuoColors.correctFill : DuoColors.wrongFill, showsDivider: false) {
            VStack(alignment: .leading, spacing: 14) {
                HStack(spacing: 12) {
                    MascotView(mood: mood ?? (correct ? .happy : .think), size: 54,
                               reactTo: reaction, reactKey: reactionKey)
                        .accessibilityHidden(true)
                    VStack(alignment: .leading, spacing: 4) {
                        Label(title, systemImage: correct ? "checkmark.circle.fill" : "arrow.clockwise.circle.fill")
                            .duoFont(.heading).foregroundStyle(accent).accessibilityFocused($focused)
                        if let answer, !correct {
                            Text("正确答案：\(MathText.render(answer))").duoFont(.caption).foregroundStyle(accent)
                        } else if let message, !message.isEmpty {
                            Text(message).duoFont(.caption).foregroundStyle(accent)
                        }
                    }.frame(maxWidth: .infinity, alignment: .leading)
                    if let onReport {
                        Button(action: onReport) {
                            Image(systemName: "flag").font(.system(size: 16, weight: .bold))
                                .foregroundStyle(accent).frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain).accessibilityLabel("报告题目问题")
                        .accessibilityIdentifier("question-report-flag")
                    }
                }
                if !explanation.isEmpty {
                    ScrollView {
                        HStack(alignment: .top, spacing: 8) {
                            Text(MathText.render(explanation)).duoFont(.body).foregroundStyle(DuoColors.inkMuted)
                                .frame(maxWidth: .infinity, alignment: .leading)
                            TTSButton(path: audio, size: 16)
                        }
                    }
                    .frame(maxHeight: 120).fixedSize(horizontal: false, vertical: true)
                    .accessibilityIdentifier("lesson-explanation")
                }
                Button(buttonTitle, action: onContinue)
                    .buttonStyle(ChunkyButtonStyle(correct ? .primary : .danger))
                    .accessibilityIdentifier(buttonIdentifier)
            }
        }
        .onAppear { focused = true }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }
}

struct LearningPageHeader: View {
    let eyebrow: String
    let title: String
    let subtitle: String
    var tint: Color = DuoColors.primary
    var mood: MascotMood = .wave

    var body: some View {
        HStack(alignment: .center, spacing: 12) {
            VStack(alignment: .leading, spacing: 8) {
                Text(eyebrow)
                    .duoFont(.caption)
                    .foregroundStyle(DuoColors.inkMuted)
                Text(title)
                    .duoFont(.heading)
                    .foregroundStyle(DuoColors.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(subtitle)
                    .duoFont(.caption)
                    .foregroundStyle(DuoColors.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            MascotView(mood: mood, size: 76)
                .padding(6)
                .accessibilityHidden(true)
        }
        .accessibilityElement(children: .combine)
    }
}

struct LearningSectionTitle: View {
    let title: String
    var detail: String? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(title).duoFont(.subhead).foregroundStyle(DuoColors.ink)
            if let detail {
                Text(detail).duoFont(.caption).foregroundStyle(DuoColors.inkMuted)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .accessibilityAddTraits(.isHeader)
    }
}

private struct LearningCardModifier: ViewModifier {
    var tint: Color?
    func body(content: Content) -> some View {
        content
            .padding(18)
            .background(DuoColors.surface, in: RoundedRectangle(cornerRadius: Radius.large))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.large)
                    .strokeBorder(tint ?? DuoColors.border, lineWidth: 2)
            }
    }
}

extension View {
    func learningCard(tint: Color? = nil) -> some View {
        modifier(LearningCardModifier(tint: tint))
    }

    /// Apply inside a ScrollView so wide layouts stay centered, without
    /// constraining the scroll view's own viewport or safe-area behavior.
    func learningContent() -> some View {
        self.frame(maxWidth: LearningLayout.contentWidth)
            .padding(.horizontal, LearningLayout.pagePadding)
            .padding(.vertical, 20)
            .frame(maxWidth: .infinity)
    }
}
