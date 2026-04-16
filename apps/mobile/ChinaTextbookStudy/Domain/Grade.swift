import Foundation

/// Answer grading — 1:1 port of packages/core/src/grade.ts.
///
/// Tolerances:
///   - whitespace, full-width vs half-width punctuation
///   - case-insensitive
///   - numeric formats (leading zeros, fractions, units)
///   - matching pairs are order-independent set equality
enum Grade {
    private static let trueValues: Set<String> = ["对", "正确", "true", "t", "✓", "√", "y", "yes"]
    private static let falseValues: Set<String> = ["错", "错误", "false", "f", "✗", "×", "n", "no"]

    static func gradeAnswer(question: Question, userAnswer: String) -> Bool {
        let trimmed = userAnswer.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty { return false }
        let correct = question.answer

        switch question.type {
        case .trueFalse:
            let u = normalize(userAnswer)
            let c = normalize(correct)
            let userIsTrue = trueValues.contains(trimmed) || trueValues.contains(u)
            let userIsFalse = falseValues.contains(trimmed) || falseValues.contains(u)
            let correctIsTrue = trueValues.contains(correct.trimmingCharacters(in: .whitespacesAndNewlines))
                || trueValues.contains(c)
            if userIsTrue || userIsFalse {
                return userIsTrue == correctIsTrue
            }
            return u == c

        case .choice:
            let u = String(trimmed.uppercased().first ?? " ")
            var c = String(correct.trimmingCharacters(in: .whitespacesAndNewlines).uppercased().first ?? " ")
            // If `answer` is not a single A-D letter, look it up in options.
            let isLetter = c.count == 1 && (c >= "A" && c <= "D")
            if !isLetter, !question.options.isEmpty {
                let cn = normalize(correct)
                let idx = question.options.firstIndex { opt in
                    let stripped = stripOptionPrefix(opt)
                    return normalize(opt) == cn || normalize(stripped) == cn
                }
                if let idx, idx < 4 {
                    c = String(UnicodeScalar(65 + idx)!)
                }
            }
            return u == c

        case .fillBlank, .calculation, .wordProblem:
            if normalize(userAnswer) == normalize(correct) { return true }
            let un = normalizeNumeric(userAnswer)
            let cn = normalizeNumeric(correct)
            if !un.isEmpty, !cn.isEmpty, un == cn { return true }
            if let uf = Double(un), let cf = Double(cn), abs(uf - cf) < 1e-6 { return true }
            return false

        case .fillBlankText:
            return normalizeText(userAnswer) == normalizeText(correct)

        case .wordOrder:
            return normalizeWordOrder(userAnswer) == normalizeWordOrder(correct)

        case .matching:
            let userPairs = parseMatchingAnswer(userAnswer)
            let correctPairs = parseMatchingAnswer(correct)
            return userPairs == correctPairs
        }
    }

    // MARK: - normalization helpers

    static func normalize(_ s: String) -> String {
        var out = s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        out = out.components(separatedBy: .whitespacesAndNewlines).joined()
        let pairs: [(String, String)] = [
            ("，", ","), ("。", "."), ("（", "("), ("）", ")"), ("：", ":"),
        ]
        for (k, v) in pairs { out = out.replacingOccurrences(of: k, with: v) }
        return out
    }

    /// Strip leading "A. " / "B、" prefixes from option text.
    private static func stripOptionPrefix(_ s: String) -> String {
        guard let first = s.first, ("A"..."D").contains(first) else { return s }
        var idx = s.index(after: s.startIndex)
        if idx < s.endIndex {
            let c = s[idx]
            if c == "." || c == "、" { idx = s.index(after: idx) }
            while idx < s.endIndex, s[idx].isWhitespace { idx = s.index(after: idx) }
            return String(s[idx...])
        }
        return s
    }

    private static func normalizeNumeric(_ s: String) -> String {
        // keep digits, '-', '.', '/', '%' and ascii letters (e.g. "m" for meters)
        let allowed: Set<Character> = {
            var set = Set<Character>("0123456789-./%")
            for c in "abcdefghijklmnopqrstuvwxyz" { set.insert(c) }
            return set
        }()
        var out = normalize(s).filter { allowed.contains($0) }
        // strip leading zeros (but keep a single zero if everything is zeros)
        while out.count > 1, out.first == "0", let second = out.dropFirst().first, second.isNumber {
            out.removeFirst()
        }
        return out
    }

    private static func normalizeText(_ s: String) -> String {
        var out = s.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        out = out.components(separatedBy: .whitespacesAndNewlines).joined()
        let punct = Set<Character>("，。！？：；,.!?:;()（）\"'`")
        out.removeAll { punct.contains($0) }
        return out
    }

    private static func normalizeWordOrder(_ s: String) -> String {
        var out = s.trimmingCharacters(in: .whitespacesAndNewlines)
        out = out.replacingOccurrences(of: "，", with: ",")
        out = out.components(separatedBy: .whitespacesAndNewlines).joined()
        return out
    }

    private static func parseMatchingAnswer(_ s: String) -> [String: String] {
        var cleaned = s.trimmingCharacters(in: .whitespacesAndNewlines)
        cleaned = cleaned.replacingOccurrences(of: "，", with: ",")
        cleaned = cleaned.components(separatedBy: .whitespacesAndNewlines).joined()
        if cleaned.isEmpty { return [:] }
        var map: [String: String] = [:]
        for pair in cleaned.split(separator: ",") {
            let parts = pair.split(separator: "-", maxSplits: 1).map(String.init)
            if parts.count == 2, !parts[0].isEmpty, !parts[1].isEmpty {
                map[parts[0].uppercased()] = parts[1]
            }
        }
        return map
    }
}
