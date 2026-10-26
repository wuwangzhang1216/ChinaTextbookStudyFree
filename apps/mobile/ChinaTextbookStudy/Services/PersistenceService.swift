import Foundation
#if canImport(WidgetKit)
import WidgetKit
#endif

/// Read/write JSON snapshots under `Application Support/cstf/`.
/// Used by ProgressStore (and any future per-user state).
enum PersistenceService {
    private static var root: URL {
        let fm = FileManager.default
        let base = (try? fm.url(for: .applicationSupportDirectory,
                                in: .userDomainMask,
                                appropriateFor: nil,
                                create: true)) ?? fm.temporaryDirectory
        let dir = base.appendingPathComponent("cstf", isDirectory: true)
        try? fm.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir
    }

    static func url(for filename: String) -> URL {
        root.appendingPathComponent(filename)
    }

    static func read<T: Decodable>(_ type: T.Type, from filename: String) -> T? {
        let url = url(for: filename)
        guard let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(type, from: data)
    }

    static func write<T: Encodable>(_ value: T, to filename: String) throws {
        let url = url(for: filename)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        let data = try encoder.encode(value)
        try data.write(to: url, options: .atomic)

        // ios-retention-3: every progress save also refreshes the lightweight
        // home-screen-widget snapshot in the App Group container. Failures are
        // silent — the widget is a bonus surface, never a reason to fail a save.
        if let progress = value as? UserProgress {
            syncWidgetSnapshot(from: progress)
        }
    }

    // MARK: - Home-screen widget snapshot (ios-retention-3)

    /// App Group shared between the main app and the widget extension.
    /// Must match both targets' `com.apple.security.application-groups`.
    static let appGroupId = "group.com.wuwangzhang1216.congcongschool"

    /// Filename of the snapshot JSON inside the App Group container.
    /// The widget extension reads this file with its own tiny decoder —
    /// keep the JSON keys stable (schema versioned via `schema`).
    static let widgetSnapshotFilename = "widget-snapshot.json"

    /// Lightweight, denormalised state the widget needs. Raw date-keyed
    /// fields (`lastActiveDate` / `lastXpDate` / `streakFreezes`) are
    /// included so the widget can re-derive "today" values after midnight
    /// without the app running.
    struct WidgetSnapshot: Codable, Equatable {
        var schema: Int
        /// Raw stored streak (chain length as of `lastActiveDate`).
        var streak: Int
        /// `displayStreak` semantics at save time: the streak studying today
        /// could still continue (shield coverage included), else 0.
        var effectiveStreak: Int
        var streakFreezes: Int
        var studiedToday: Bool
        var lastActiveDate: String   // yyyy-MM-dd, "" = never studied
        var hearts: Int
        var dailyGoal: Int
        var todayXp: Int             // already zeroed when lastXpDate != savedAtDay
        var lastXpDate: String       // yyyy-MM-dd, "" = never earned XP
        var savedAtDay: String       // yyyy-MM-dd the snapshot was computed for
    }

    /// Last snapshot bytes written this process — skip redundant disk writes
    /// and (more importantly) redundant WidgetKit timeline reloads.
    private static var lastSnapshotData: Data?

    /// Pure mapping from the full progress blob to the widget snapshot.
    static func widgetSnapshot(from p: UserProgress, now: Date = Date()) -> WidgetSnapshot {
        let today = SRS.todayString(now: now)
        // Mirror of ProgressStore.salvageableStreak — computed here from the
        // raw blob so the write path never has to reach back into the store.
        let effective: Int
        if p.lastActiveDate == today {
            effective = p.streak
        } else {
            let adv = Streak.advance(
                streak: p.streak,
                streakFreezes: p.streakFreezes ?? 0,
                lastActiveDate: p.lastActiveDate,
                today: today
            )
            effective = adv.streak == p.streak + 1 ? p.streak : 0
        }
        return WidgetSnapshot(
            schema: 1,
            streak: p.streak,
            effectiveStreak: effective,
            streakFreezes: p.streakFreezes ?? 0,
            studiedToday: p.lastActiveDate == today,
            lastActiveDate: p.lastActiveDate,
            hearts: p.hearts ?? Economy.maxHearts,
            dailyGoal: p.dailyGoal ?? Economy.defaultDailyGoal,
            todayXp: p.lastXpDate == today ? (p.todayXp ?? 0) : 0,
            lastXpDate: p.lastXpDate ?? "",
            savedAtDay: today
        )
    }

    /// Write the snapshot into the App Group container and poke WidgetKit.
    /// Silently no-ops when the container is unavailable (e.g. entitlement
    /// missing on an ad-hoc build) — never affects the main save path.
    static func syncWidgetSnapshot(from p: UserProgress, now: Date = Date()) {
        guard let container = FileManager.default
            .containerURL(forSecurityApplicationGroupIdentifier: appGroupId)
        else { return }

        let snapshot = widgetSnapshot(from: p, now: now)
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.sortedKeys]
        guard let data = try? encoder.encode(snapshot) else { return }
        guard data != lastSnapshotData else { return }
        lastSnapshotData = data

        let url = container.appendingPathComponent(widgetSnapshotFilename)
        do {
            try data.write(to: url, options: .atomic)
        } catch {
            return
        }

        #if canImport(WidgetKit)
        WidgetCenter.shared.reloadAllTimelines()
        #endif
    }
}
