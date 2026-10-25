import SwiftUI

/// Duolingo-style bottom tab bar — flat, bold, single-tone glyphs.
///
/// - Adaptive background (white in light, navy in dark) with a top hairline.
/// - Active tab: filled glyph in its brand color on a soft tinted capsule.
/// - Inactive tab: the same glyph in muted gray (never a different shape).
/// - The active glyph bounces when selected.
struct BottomTabBar: View {
    @Binding var activeTab: AppTab
    @ObservedObject var progressStore: ProgressStore
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        HStack(spacing: 0) {
            ForEach(AppTab.allCases, id: \.self) { tab in
                tabItem(tab)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background(DuoColors.bg)
        .overlay(alignment: .top) {
            Rectangle().fill(DuoColors.border).frame(height: 1)
        }
    }

    @ViewBuilder
    private func tabItem(_ tab: AppTab) -> some View {
        let isActive = activeTab == tab
        let badge = badge(for: tab)

        Button {
            guard activeTab != tab else { return }
            HapticEngine.shared.tap()
            withAnimation(reduceMotion ? nil : Motion.press) { activeTab = tab }
        } label: {
            VStack(spacing: 4) {
              ZStack(alignment: .topTrailing) {
                ZStack {
                    if isActive {
                        RoundedRectangle(cornerRadius: Radius.card)
                            .fill(tab.activeColor.opacity(0.14))
                            .overlay { RoundedRectangle(cornerRadius: Radius.card).strokeBorder(tab.activeColor.opacity(0.45), lineWidth: 2) }
                            .frame(width: 48, height: 34)
                    }
                    Image(systemName: tab.symbol)
                        .font(.system(size: 22, weight: .semibold))
                        .foregroundStyle(isActive ? tab.activeColor : DuoColors.inkMuted)
                        .symbolEffect(.bounce, value: reduceMotion ? false : isActive)
                }
                .frame(width: 54, height: 34)

                if let count = badge?.count, count > 0 {
                    Text(count > 99 ? "99+" : "\(count)")
                        .duoFont(.micro)
                        .foregroundStyle(.white)
                        .padding(.horizontal, 5)
                        .frame(minWidth: 18, minHeight: 18)
                        .background(DuoColors.danger, in: .capsule)
                        .overlay(Capsule().strokeBorder(DuoColors.bg, lineWidth: 2))
                        .offset(x: 2, y: -2)
                } else if badge?.dot == true {
                    Circle()
                        .fill(DuoColors.danger)
                        .frame(width: 10, height: 10)
                        .overlay(Circle().strokeBorder(DuoColors.bg, lineWidth: 2))
                        .offset(x: 2, y: 0)
                }
              }
              Text(tab.label)
                .duoFont(.micro)
                .foregroundStyle(isActive ? DuoColors.ink : DuoColors.inkMuted)
            }
            .frame(maxWidth: .infinity)
            .frame(minHeight: 48)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .accessibilityLabel(accessibilityLabel(for: tab, badge: badge))
        .accessibilityIdentifier("tab-\(tab.rawValue)")
        .accessibilityAddTraits(isActive ? [.isSelected] : [])
    }

    /// VoiceOver reads the badge, not just the tab name — "我的，3 个奖励可领取".
    private func accessibilityLabel(for tab: AppTab, badge: BadgeInfo?) -> String {
        if let count = badge?.count, count > 0 {
            switch tab {
            case .review:  return "\(tab.label)，\(count) 道错题待复习"
            case .profile: return "\(tab.label)，\(count) 个奖励可领取"
            default:       return "\(tab.label)，\(count) 条新提醒"
            }
        }
        if badge?.dot == true {
            return "\(tab.label)，有新内容"
        }
        return tab.label
    }

    private struct BadgeInfo { var count: Int?; var dot: Bool? }

    private func badge(for tab: AppTab) -> BadgeInfo? {
        switch tab {
        case .league:
            // 上周结算结果还没看 → 红点提醒。
            return progressStore.pendingLeagueResult != nil ? BadgeInfo(dot: true) : nil
        case .review:
            let due = progressStore.dueMistakes.count
            return due > 0 ? BadgeInfo(count: due) : nil
        case .profile:
            // Claimable rewards waiting on the profile surfaces: finished
            // daily quests + unlocked-but-unclaimed achievements.
            let claimable = progressStore.claimableQuestCount + progressStore.claimableAchievementCount
            return claimable > 0 ? BadgeInfo(count: claimable) : nil
        default: return nil
        }
    }
}

// MARK: - Tab Definition

enum AppTab: String, CaseIterable {
    case learn, league, review, shop, profile

    var label: String {
        switch self {
        case .learn:   return "学习"
        case .league:  return "排行"
        case .review:  return "错题本"
        case .shop:    return "商店"
        case .profile: return "我的"
        }
    }

    var symbol: String {
        switch self {
        case .learn:   return "house.fill"
        case .league:  return "trophy.fill"
        case .review:  return "book.fill"
        case .shop:    return "bag.fill"
        case .profile: return "person.crop.circle.fill"
        }
    }

    var activeColor: Color {
        switch self {
        case .learn:   return DuoColors.primary       // green — the flagship tab
        case .league:  return DuoColors.bee           // gold — the trophy tab
        case .review:  return DuoColors.fox           // orange
        case .shop:    return DuoColors.beetle        // purple
        case .profile: return DuoColors.secondary     // blue
        }
    }
}
