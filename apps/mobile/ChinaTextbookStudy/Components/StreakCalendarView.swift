import SwiftUI

/// 本周 7 格连胜日历（ios-path-8 / ios-retention-4）。
///
/// 通用组件：结算页的全屏连胜幕和首页的连胜详情弹层共用，数据来自
/// `ProgressStore.weekXPEntries()`——**日历周，周一 → 周日**（parity-6），
/// 所以「今天」可能落在任意一格，绝不是「最后一格」。使用自适应颜色与
/// 等宽日期格，小屏幕上缩小圆点，保持一周七天完整可见。
///
/// - `entries`: 本周 7 天（周一 → 周日），`studied` = 当天有任意学习活动（XP > 0）。
/// - `todayIndex`: 今天在这 7 格里的下标（周一=0 … 周日=6），
///   调用方传 `ProgressStore.todayIndexInWeek()`；越界则本周不含今天，不高亮任何一格。
/// - `todayStudied`: 今天是否已打卡；驱动「今天」那一格的强调态。
struct StreakCalendarView: View {
    let entries: [(dateKey: String, studied: Bool)]
    let todayIndex: Int
    let todayStudied: Bool

    private static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.dateFormat = "yyyy-MM-dd"
        f.locale = Locale(identifier: "en_US_POSIX")
        return f
    }()

    private static let weekdaySymbols = ["日", "一", "二", "三", "四", "五", "六"]

    private func weekdayLabel(for dateKey: String) -> String {
        guard let date = Self.dayFormatter.date(from: dateKey) else { return "·" }
        let weekday = Calendar.current.component(.weekday, from: date)   // 1 = Sunday
        return Self.weekdaySymbols[(weekday - 1) % 7]
    }

    var body: some View {
        GeometryReader { geometry in
            let count = max(1, entries.count)
            let diameter = min(42, max(0, (geometry.size.width - CGFloat(count - 1) * 4) / CGFloat(count)))
            HStack(spacing: 4) {
                ForEach(entries.indices, id: \.self) { i in
                    dayCell(at: i, diameter: diameter)
                }
            }
        }
        .frame(height: 66)
        .accessibilityElement(children: .combine)
        .accessibilityLabel("本周学习日历")
        .accessibilityIdentifier("streak-calendar")
    }

    @ViewBuilder
    private func dayCell(at index: Int, diameter: CGFloat) -> some View {
        let entry = entries[index]
        let isToday = index == todayIndex
        let lit = isToday ? todayStudied : entry.studied

        VStack(spacing: 6) {
            Text(isToday ? "今" : weekdayLabel(for: entry.dateKey))
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(isToday ? DuoColors.fox : DuoColors.darkInkMuted)

            ZStack {
                Circle()
                    .fill(lit ? DuoColors.fox : DuoColors.darkSurfaceAlt)
                    .frame(width: max(0, diameter - 8), height: max(0, diameter - 8))
                if lit {
                    Image(systemName: "flame.fill")
                        .font(.system(size: 15, weight: .heavy))
                        .foregroundStyle(.white)
                } else {
                    Circle()
                        .fill(DuoColors.darkInkSofter.opacity(0.35))
                        .frame(width: 6, height: 6)
                }
            }
            .overlay {
                if isToday {
                    Circle()
                        .strokeBorder(DuoColors.fox, lineWidth: 2)
                        .frame(width: diameter, height: diameter)
                }
            }
            .frame(width: diameter, height: diameter)
        }
        .frame(maxWidth: .infinity)
    }
}
