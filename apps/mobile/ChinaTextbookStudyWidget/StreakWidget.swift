import WidgetKit
import SwiftUI
import UIKit

// MARK: - Snapshot (JSON mirror of PersistenceService.WidgetSnapshot)
//
// The main app writes `widget-snapshot.json` into the shared App Group
// container on every progress save (see Services/PersistenceService.swift).
// This extension deliberately does NOT import any main-app source — it is a
// tiny standalone implementation that only shares the JSON contract.

struct StreakSnapshot: Codable {
    var schema: Int
    var streak: Int
    var effectiveStreak: Int
    var streakFreezes: Int
    var studiedToday: Bool
    var lastActiveDate: String   // yyyy-MM-dd, "" = never studied
    var hearts: Int
    var dailyGoal: Int
    var todayXp: Int
    var lastXpDate: String       // yyyy-MM-dd
    var savedAtDay: String       // yyyy-MM-dd the snapshot was computed for

    /// Gallery/placeholder preview data.
    static let placeholder = StreakSnapshot(
        schema: 1, streak: 7, effectiveStreak: 7, streakFreezes: 2,
        studiedToday: true, lastActiveDate: "", hearts: 5,
        dailyGoal: 50, todayXp: 60, lastXpDate: "", savedAtDay: ""
    )
}

enum SnapshotStore {
    static let appGroupId = "group.com.wuwangzhang1216.congcongschool"
    static let filename = "widget-snapshot.json"

    static func load() -> StreakSnapshot? {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
        else { return nil }
        let url = container.appendingPathComponent(filename)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(StreakSnapshot.self, from: data)
    }
}

// MARK: - Date helpers (mirror of the app's SRS day-string math)

enum WidgetDates {
    static let dayFormatter: DateFormatter = {
        let f = DateFormatter()
        f.calendar = Calendar(identifier: .gregorian)
        f.locale = Locale(identifier: "en_US_POSIX")
        f.timeZone = .current
        f.dateFormat = "yyyy-MM-dd"
        return f
    }()

    static func dayString(_ date: Date) -> String {
        dayFormatter.string(from: date)
    }

    /// Whole-day difference `to` − `from`; nil when unparseable.
    static func daysBetween(_ from: String, _ to: String) -> Int? {
        guard let a = dayFormatter.date(from: from),
              let b = dayFormatter.date(from: to) else { return nil }
        return Calendar.current.dateComponents([.day], from: a, to: b).day
    }
}

// MARK: - Display state

enum PandaMood {
    case happy    // studied today — flame lit
    case calm     // morning, not studied yet
    case worried  // afternoon, still not studied
    case crying   // after 20:00, flame about to die
}

/// Everything the views need, resolved for one wall-clock moment. Mirrors the
/// app's `salvageableStreak` semantics so the widget never quotes a streak
/// that is already dead — even after midnight with no app launch in between.
struct StreakDisplay {
    var streak: Int
    var studiedToday: Bool
    var mood: PandaMood
    var todayXp: Int
    var dailyGoal: Int

    var flameLit: Bool { studiedToday }

    var message: String {
        if studiedToday { return "今天学过啦，真棒！" }
        switch mood {
        case .crying:  return "火苗快熄灭啦！"
        case .worried: return "小火苗在等你哦"
        default:       return streak > 0 ? "今天也来学一课吧" : "来点燃小火苗吧"
        }
    }

    init(snapshot: StreakSnapshot?, date: Date) {
        let goal = snapshot?.dailyGoal ?? 50
        guard let s = snapshot else {
            // No snapshot yet (app never ran / container unavailable).
            self.streak = 0
            self.studiedToday = false
            self.todayXp = 0
            self.dailyGoal = goal
            self.mood = Self.idleMood(for: date)
            return
        }
        let today = WidgetDates.dayString(date)
        let studied = !s.lastActiveDate.isEmpty && s.lastActiveDate == today

        // Effective streak for THIS calendar day (shield coverage included):
        // gap 1 = yesterday, still continuable; gap ≥ 2 = needs gap-1 shields.
        let effective: Int
        if studied || s.lastActiveDate == today {
            effective = s.streak
        } else if s.lastActiveDate.isEmpty {
            effective = 0
        } else if let gap = WidgetDates.daysBetween(s.lastActiveDate, today) {
            if gap <= 1 {
                effective = s.streak
            } else {
                effective = s.streakFreezes >= gap - 1 ? s.streak : 0
            }
        } else {
            effective = 0
        }

        self.streak = effective
        self.studiedToday = studied
        self.todayXp = s.lastXpDate == today ? s.todayXp : 0
        self.dailyGoal = goal
        self.mood = studied ? .happy : Self.idleMood(for: date)
    }

    /// 聪聪's mood while today is still unstudied, by hour of day:
    /// morning calm → afternoon anxious → after 20:00 crying.
    static func idleMood(for date: Date) -> PandaMood {
        let hour = Calendar.current.component(.hour, from: date)
        if hour >= 20 { return .crying }
        if hour >= 12 { return .worried }
        return .calm
    }
}

// MARK: - Timeline provider

struct StreakEntry: TimelineEntry {
    let date: Date
    let state: StreakDisplay
}

struct StreakProvider: TimelineProvider {
    func placeholder(in context: Context) -> StreakEntry {
        StreakEntry(date: Date(), state: StreakDisplay(snapshot: .placeholder, date: Date()))
    }

    func getSnapshot(in context: Context, completion: @escaping (StreakEntry) -> Void) {
        let now = Date()
        let snapshot = context.isPreview ? .placeholder : (SnapshotStore.load() ?? .placeholder)
        completion(StreakEntry(date: now, state: StreakDisplay(snapshot: snapshot, date: now)))
    }

    /// One entry now + one per hour boundary until midnight (mood shifts at
    /// 12:00 and 20:00, and the whole state flips at the day rollover), then
    /// regenerate after midnight so "today" is re-derived with fresh dates.
    func getTimeline(in context: Context, completion: @escaping (Timeline<StreakEntry>) -> Void) {
        let snapshot = SnapshotStore.load()
        let calendar = Calendar.current
        let now = Date()

        var entries = [StreakEntry(date: now, state: StreakDisplay(snapshot: snapshot, date: now))]

        let startOfToday = calendar.startOfDay(for: now)
        let midnight = calendar.date(byAdding: .day, value: 1, to: startOfToday)
            ?? now.addingTimeInterval(24 * 3600)
        var next = calendar.nextDate(
            after: now,
            matching: DateComponents(minute: 0, second: 0),
            matchingPolicy: .nextTime
        ) ?? now.addingTimeInterval(3600)
        while next < midnight {
            entries.append(StreakEntry(date: next, state: StreakDisplay(snapshot: snapshot, date: next)))
            next = next.addingTimeInterval(3600)
        }

        completion(Timeline(entries: entries, policy: .after(midnight)))
    }
}

// MARK: - Brand colors (literals — no main-app design system import)

private extension Color {
    init(widgetHex hex: UInt, opacity: Double = 1) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }

    static let flameOrange = Color(widgetHex: 0xFF9600)   // DuoColors.fox
    static let flameGold   = Color(widgetHex: 0xFFC800)   // DuoColors.bee
    static let pandaBlack  = Color(widgetHex: 0x2E2E2E)
    static let pandaWhite  = Color(widgetHex: 0xFBFBFB)
    static let pandaEel    = Color(widgetHex: 0x3A3A3A)
    static let tearBlue    = Color(widgetHex: 0x7EC4F0)
    static let blushPink   = Color(widgetHex: 0xFF9AA8)
}

// MARK: - Mini 聪聪 (static, simplified port of Components/MascotView.swift)

struct MiniPandaFace: View {
    var mood: PandaMood
    var size: CGFloat

    var body: some View {
        Canvas { ctx, canvasSize in
            let s = canvasSize.width / 120

            func ellipse(_ cx: CGFloat, _ cy: CGFloat, _ rx: CGFloat, _ ry: CGFloat, _ fill: Color) {
                let rect = CGRect(x: (cx - rx) * s, y: (cy - ry) * s, width: rx * 2 * s, height: ry * 2 * s)
                ctx.fill(Path(ellipseIn: rect), with: .color(fill))
            }
            func circle(_ cx: CGFloat, _ cy: CGFloat, _ r: CGFloat, _ fill: Color) {
                ellipse(cx, cy, r, r, fill)
            }
            func stroke(_ path: Path, _ color: Color, _ width: CGFloat) {
                ctx.stroke(path, with: .color(color), style: StrokeStyle(lineWidth: width * s, lineCap: .round))
            }

            // Ears
            circle(30, 26, 14, .pandaBlack)
            circle(90, 26, 14, .pandaBlack)
            // Head (white blob; soft outline keeps it visible on light backgrounds
            // and reads fine in dark mode too)
            let head = CGRect(x: 16 * s, y: 20 * s, width: 88 * s, height: 86 * s)
            ctx.fill(Path(ellipseIn: head), with: .color(.pandaWhite))
            ctx.stroke(Path(ellipseIn: head), with: .color(.pandaBlack.opacity(0.18)), lineWidth: 1.5 * s)
            // Eye patches
            ellipse(43, 58, 12, 15, .pandaBlack)
            ellipse(77, 58, 12, 15, .pandaBlack)
            // Eye sockets
            circle(44, 56, 8.5, .pandaWhite)
            circle(76, 56, 8.5, .pandaWhite)

            // Eyes + brows per mood
            switch mood {
            case .happy:
                // Cheerful arcs (eyes-closed smile)
                var l = Path()
                l.move(to: CGPoint(x: 37 * s, y: 57 * s))
                l.addQuadCurve(to: CGPoint(x: 51 * s, y: 57 * s), control: CGPoint(x: 44 * s, y: 49 * s))
                stroke(l, .pandaEel, 3)
                var r = Path()
                r.move(to: CGPoint(x: 69 * s, y: 57 * s))
                r.addQuadCurve(to: CGPoint(x: 83 * s, y: 57 * s), control: CGPoint(x: 76 * s, y: 49 * s))
                stroke(r, .pandaEel, 3)
                // Blush
                ellipse(30, 70, 6, 3.5, .blushPink.opacity(0.7))
                ellipse(90, 70, 6, 3.5, .blushPink.opacity(0.7))

            case .calm:
                circle(44, 56, 5, .pandaEel)
                circle(45.5, 54.5, 1.5, .white)
                circle(76, 56, 5, .pandaEel)
                circle(77.5, 54.5, 1.5, .white)

            case .worried:
                circle(44, 57, 4.5, .pandaEel)
                circle(45.3, 55.7, 1.3, .white)
                circle(76, 57, 4.5, .pandaEel)
                circle(77.3, 55.7, 1.3, .white)
                // Worried brows slanting inward-up
                var bl = Path()
                bl.move(to: CGPoint(x: 34 * s, y: 44 * s))
                bl.addLine(to: CGPoint(x: 50 * s, y: 48 * s))
                stroke(bl, .pandaEel, 2.5)
                var br = Path()
                br.move(to: CGPoint(x: 86 * s, y: 44 * s))
                br.addLine(to: CGPoint(x: 70 * s, y: 48 * s))
                stroke(br, .pandaEel, 2.5)

            case .crying:
                // Squeezed-shut downward arcs
                var l = Path()
                l.move(to: CGPoint(x: 37 * s, y: 54 * s))
                l.addQuadCurve(to: CGPoint(x: 51 * s, y: 54 * s), control: CGPoint(x: 44 * s, y: 60 * s))
                stroke(l, .pandaEel, 3)
                var r = Path()
                r.move(to: CGPoint(x: 69 * s, y: 54 * s))
                r.addQuadCurve(to: CGPoint(x: 83 * s, y: 54 * s), control: CGPoint(x: 76 * s, y: 60 * s))
                stroke(r, .pandaEel, 3)
                // Tears
                ellipse(40, 67, 2.6, 4, .tearBlue)
                ellipse(80, 67, 2.6, 4, .tearBlue)
            }

            // Nose
            var nose = Path()
            nose.move(to: CGPoint(x: 54 * s, y: 70 * s))
            nose.addQuadCurve(to: CGPoint(x: 66 * s, y: 70 * s), control: CGPoint(x: 60 * s, y: 68 * s))
            nose.addQuadCurve(to: CGPoint(x: 60 * s, y: 78 * s), control: CGPoint(x: 66 * s, y: 76 * s))
            nose.addQuadCurve(to: CGPoint(x: 54 * s, y: 70 * s), control: CGPoint(x: 54 * s, y: 76 * s))
            nose.closeSubpath()
            ctx.fill(nose, with: .color(.pandaBlack))

            // Mouth per mood
            var mouth = Path()
            switch mood {
            case .happy:
                mouth.move(to: CGPoint(x: 52 * s, y: 84 * s))
                mouth.addQuadCurve(to: CGPoint(x: 68 * s, y: 84 * s), control: CGPoint(x: 60 * s, y: 92 * s))
            case .calm:
                mouth.move(to: CGPoint(x: 54 * s, y: 86 * s))
                mouth.addQuadCurve(to: CGPoint(x: 66 * s, y: 86 * s), control: CGPoint(x: 60 * s, y: 90 * s))
            case .worried:
                mouth.move(to: CGPoint(x: 54 * s, y: 88 * s))
                mouth.addQuadCurve(to: CGPoint(x: 66 * s, y: 86 * s), control: CGPoint(x: 60 * s, y: 87 * s))
            case .crying:
                mouth.move(to: CGPoint(x: 53 * s, y: 90 * s))
                mouth.addQuadCurve(to: CGPoint(x: 67 * s, y: 90 * s), control: CGPoint(x: 60 * s, y: 83 * s))
            }
            stroke(mouth, .pandaBlack, 2.5)
        }
        .frame(width: size, height: size)
        .accessibilityHidden(true)
    }
}

// MARK: - Views

struct StreakWidgetEntryView: View {
    @Environment(\.widgetFamily) private var family
    var entry: StreakEntry

    var body: some View {
        Group {
            switch family {
            case .accessoryCircular:
                circular
            default:
                small
            }
        }
        .widgetURL(URL(string: "cstf://streak"))
    }

    private var flameColor: Color {
        entry.state.flameLit ? .flameOrange : Color.secondary.opacity(0.55)
    }

    private var accessibilityText: String {
        let base = "连续学习\(entry.state.streak)天。"
        return base + (entry.state.studiedToday ? "今天已经学过了。" : "今天还没学习。")
    }

    // System small: flame + streak number as the hero, 聪聪 alongside.
    private var small: some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack(alignment: .top, spacing: 0) {
                VStack(alignment: .leading, spacing: 0) {
                    Image(systemName: entry.state.flameLit ? "flame.fill" : "flame")
                        .font(.system(size: 26, weight: .bold))
                        .foregroundStyle(flameColor)
                        .symbolRenderingMode(.hierarchical)
                    Text("\(entry.state.streak)")
                        .font(.system(size: 34, weight: .heavy, design: .rounded))
                        .foregroundStyle(entry.state.streak > 0 ? Color.primary : Color.secondary)
                        .contentTransition(.numericText())
                    Text("连胜天数")
                        .font(.system(size: 11, weight: .bold))
                        .foregroundStyle(.secondary)
                }
                Spacer(minLength: 0)
                MiniPandaFace(mood: entry.state.mood, size: 58)
                    .padding(.top, 2)
            }
            Spacer(minLength: 0)
            Text(entry.state.message)
                .font(.system(size: 12, weight: .bold))
                .foregroundStyle(entry.state.mood == .crying ? Color.flameOrange : Color.secondary)
                .lineLimit(1)
                .minimumScaleFactor(0.8)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }

    // Lock screen circular: flame + number only.
    private var circular: some View {
        ZStack {
            AccessoryWidgetBackground()
            VStack(spacing: -3) {
                Image(systemName: entry.state.flameLit ? "flame.fill" : "flame")
                    .font(.system(size: 13, weight: .bold))
                Text("\(entry.state.streak)")
                    .font(.system(size: 20, weight: .heavy, design: .rounded))
                    .minimumScaleFactor(0.6)
                    .lineLimit(1)
            }
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(accessibilityText)
    }
}

// MARK: - Widget + bundle

struct StreakWidget: Widget {
    let kind = "ChinaTextbookStudyStreakWidget"

    var body: some WidgetConfiguration {
        StaticConfiguration(kind: kind, provider: StreakProvider()) { entry in
            StreakWidgetEntryView(entry: entry)
                .containerBackground(for: .widget) {
                    Color(uiColor: .systemBackground)
                }
        }
        .configurationDisplayName("连胜火苗")
        .description("看看聪聪和你的连胜火苗，别让它熄灭哦！")
        .supportedFamilies([.systemSmall, .accessoryCircular])
    }
}

@main
struct StreakWidgetBundle: WidgetBundle {
    var body: some Widget {
        StreakWidget()
    }
}
