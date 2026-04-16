import SwiftUI

/// Read-only achievement wall — port of apps/web/src/components/AchievementWall.tsx (subset).
/// Groups badges by category, shows a progress bar for locked ones, and a bright
/// foil background for unlocked ones.
struct AchievementsView: View {
    @ObservedObject var progressStore: ProgressStore

    private var snapshot: AchievementProgressSnapshot { progressStore.achievementSnapshot }
    private var unlockedIds: Set<String> { Set(Achievements.unlockedIds(for: snapshot)) }

    private static let categoryOrder: [AchievementCategory] = [.milestone, .streak, .perfection, .review, .shop]
    private static let categoryLabels: [AchievementCategory: String] = [
        .milestone: "里程碑",
        .streak: "连续学习",
        .perfection: "完美",
        .review: "复习",
        .shop: "商店",
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 24) {
                summary
                ForEach(Self.categoryOrder, id: \.self) { cat in
                    let items = Achievements.all.filter { $0.category == cat }
                    if !items.isEmpty {
                        section(title: Self.categoryLabels[cat] ?? cat.rawValue, items: items)
                    }
                }
            }
            .padding()
        }
        .navigationTitle("成就墙")
        .navigationBarTitleDisplayMode(.inline)
    }

    private var summary: some View {
        let unlocked = unlockedIds.count
        let total = Achievements.all.count
        return HStack {
            VStack(alignment: .leading, spacing: 4) {
                Text("已解锁 \(unlocked) / \(total)").font(.title3.bold())
                Text("继续学习解锁更多").font(.caption).foregroundStyle(.secondary)
            }
            Spacer()
            ProgressView(value: Double(unlocked), total: Double(max(total, 1)))
                .progressViewStyle(.circular)
                .controlSize(.large)
        }
        .padding()
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 14))
    }

    private func section(title: String, items: [Achievement]) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 150), spacing: 12)], spacing: 12) {
                ForEach(items, id: \.id) { ach in
                    badge(ach)
                }
            }
        }
    }

    private func badge(_ ach: Achievement) -> some View {
        let isUnlocked = unlockedIds.contains(ach.id)
        let progress = ach.progress(snapshot)
        let frac = min(1.0, Double(progress) / Double(max(ach.goal, 1)))
        let tint = Color(red: Double((ach.colorHex >> 16) & 0xFF) / 255,
                         green: Double((ach.colorHex >> 8) & 0xFF) / 255,
                         blue: Double(ach.colorHex & 0xFF) / 255)
        return VStack(spacing: 8) {
            Image(systemName: ach.iconKey.symbolName)
                .font(.system(size: 36))
                .foregroundStyle(isUnlocked ? .white : tint.opacity(0.5))
                .frame(width: 64, height: 64)
                .background(isUnlocked ? tint : Color(.tertiarySystemFill), in: .circle)
            Text(ach.name).font(.subheadline.bold())
            Text(ach.description)
                .font(.caption2)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .lineLimit(2, reservesSpace: true)
            if isUnlocked {
                Text("已解锁")
                    .font(.caption2.bold())
                    .foregroundStyle(.green)
            } else {
                ProgressView(value: frac)
                    .tint(tint)
                Text("\(progress) / \(ach.goal)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(12)
        .frame(maxWidth: .infinity)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 14))
        .accessibilityIdentifier("ach-\(ach.id)")
    }
}
