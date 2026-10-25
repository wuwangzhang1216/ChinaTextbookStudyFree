import SwiftUI

/// Shared compositions for the native app. Keep the learning canvas readable
/// on iPad, while allowing cards and labels to grow with Dynamic Type.
enum LearningLayout {
    static let contentWidth: CGFloat = 680
    static let pagePadding: CGFloat = 20
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
                    .duoFont(.title)
                    .foregroundStyle(DuoColors.ink)
                    .fixedSize(horizontal: false, vertical: true)
                Text(subtitle)
                    .duoFont(.caption)
                    .foregroundStyle(DuoColors.inkMuted)
                    .fixedSize(horizontal: false, vertical: true)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
            MascotView(mood: mood, size: 88)
                .padding(6)
                .background(tint.opacity(0.12), in: RoundedRectangle(cornerRadius: 28))
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
                    .strokeBorder(tint?.opacity(0.35) ?? DuoColors.border, lineWidth: 2)
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
