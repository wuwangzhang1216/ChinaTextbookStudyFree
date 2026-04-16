import Foundation

/// Context-aware mascot mood/reaction decisions —
/// port of packages/core/src/mascotTriggers.ts.
///
/// Pure functions; safe to unit-test.

struct MascotTriggerContext: Hashable {
    var isCorrect: Bool
    var isPerfectSession: Bool
    var attemptCount: Int
    var remainingHearts: Int
    var combo: Int
    var maxCombo: Int
    var index: Int
    var total: Int
    var totalCorrectInSession: Int
}

enum MascotTriggers {
    /// Sustained mood expression that persists after the reaction animation.
    static func decideMood(_ ctx: MascotTriggerContext) -> MascotMood {
        let isLastQuestion = ctx.index + 1 >= ctx.total

        if ctx.isCorrect {
            if isLastQuestion && ctx.isPerfectSession { return .proud }
            if ctx.remainingHearts == 1 { return .happy }
            if ctx.combo >= 5 { return .cheer }
            return .happy
        }

        // Wrong branch
        if ctx.remainingHearts <= 1 { return .embarrassed }
        if ctx.attemptCount >= 2 { return .sad }
        return .think
    }

    /// One-shot reaction animation trigger.
    static func decideReaction(_ ctx: MascotTriggerContext) -> MascotReaction? {
        let isLastQuestion = ctx.index + 1 >= ctx.total

        if ctx.isCorrect {
            if isLastQuestion && ctx.isPerfectSession { return .levelup }
            if ctx.combo == 3 || ctx.combo == 5 || ctx.combo == 10 { return .levelup }
            return .correct
        }
        return .wrong
    }

    /// Speech bubble pools, grouped by mood.
    static let bubblesByMood: [MascotMood: [String]] = [
        .happy:       ["太棒!", "答对啦!", "继续!", "漂亮!", "对的!"],
        .cheer:       ["完美!", "好厉害!", "太牛了!", "无敌!", "棒棒哒!"],
        .proud:       ["你太棒了!", "实力派!", "学霸预定!", "我为你骄傲!"],
        .sad:         ["别灰心!", "再来一次!", "差一点点!", "下次一定!"],
        .think:       ["想想看?", "再仔细一点!", "别急!", "慢慢来!"],
        .embarrassed: ["小心呀!", "保住心心!", "稳住!", "深呼吸!"],
        .wave:        ["加油!", "我们一起!"],
        .surprise:    ["哇!", "诶?", "厉害厉害!"],
    ]

    static func pickBubble(mood: MascotMood) -> String {
        let pool = bubblesByMood[mood] ?? bubblesByMood[.happy] ?? ["太棒!"]
        return pool.randomElement() ?? "太棒!"
    }

    enum BubbleTone: String, Hashable { case neutral, primary, danger }

    static func tone(for mood: MascotMood) -> BubbleTone {
        switch mood {
        case .cheer, .proud, .happy: return .primary
        case .sad, .embarrassed:     return .danger
        default:                      return .neutral
        }
    }
}
