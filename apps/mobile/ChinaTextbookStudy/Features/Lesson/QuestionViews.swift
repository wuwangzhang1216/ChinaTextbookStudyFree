import SwiftUI

/// All 6 question type views + the dispatcher that picks one — port of
/// apps/web/src/components/question/*.tsx (subset).
///
/// Each sub-view is a controlled component: parent owns `answer` and
/// `phase` (.answering | .checked); child calls `onChange` with the
/// stringified answer. This exactly mirrors the web QuestionRenderer
/// contract so logic can be swapped 1:1 against `Grade.gradeAnswer`.

// MARK: - Dispatcher

struct QuestionRendererView: View {
    let question: Question
    let answer: String
    let phase: LessonRunnerView.QuestionPhase
    let isCorrect: Bool?
    let onChange: (String) -> Void

    var body: some View {
        switch question.type {
        case .choice:
            ChoiceQuestionView(question: question, answer: answer, phase: phase, onChange: onChange)
        case .trueFalse:
            TrueFalseQuestionView(question: question, answer: answer, phase: phase, onChange: onChange)
        case .fillBlank, .calculation, .wordProblem:
            FillBlankQuestionView(question: question, answer: answer, phase: phase, onChange: onChange, keyboard: .decimalPad)
        case .fillBlankText:
            FillBlankQuestionView(question: question, answer: answer, phase: phase, onChange: onChange, keyboard: .default)
        case .wordOrder:
            WordOrderQuestionView(question: question, answer: answer, phase: phase, onChange: onChange)
        case .matching:
            MatchingQuestionView(question: question, answer: answer, phase: phase, onChange: onChange)
        }
    }
}

// MARK: - Choice

private struct ChoiceQuestionView: View {
    let question: Question
    let answer: String
    let phase: LessonRunnerView.QuestionPhase
    let onChange: (String) -> Void

    var body: some View {
        VStack(spacing: 10) {
            ForEach(Array(question.options.enumerated()), id: \.offset) { i, opt in
                let letter = letterFor(i)
                let isSelected = answer.uppercased() == letter
                Button {
                    if phase == .answering {
                        onChange(letter)
                        if let optAudio = question.audio?.options?[safe: i] ?? nil {
                            AudioPlayer.shared.play(path: optAudio)
                        }
                    }
                } label: {
                    HStack(spacing: 12) {
                        ZStack {
                            Circle()
                                .fill(isSelected ? Color.accentColor : Color(.tertiarySystemFill))
                            Text(letter)
                                .font(.headline.bold())
                                .foregroundStyle(isSelected ? Color.white : .primary)
                        }
                        .frame(width: 32, height: 32)
                        Text(opt)
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                    }
                    .padding()
                    .background(
                        isSelected ? Color.accentColor.opacity(0.12) : Color(.secondarySystemBackground),
                        in: .rect(cornerRadius: 14)
                    )
                    .overlay(
                        RoundedRectangle(cornerRadius: 14)
                            .stroke(isSelected ? Color.accentColor : Color.clear, lineWidth: 2)
                    )
                }
                .buttonStyle(.plain)
                .disabled(phase == .checked)
            }
        }
    }

    private func letterFor(_ i: Int) -> String {
        guard let scalar = Unicode.Scalar(65 + i) else { return "?" }
        return String(scalar)
    }
}

// MARK: - True / False

private struct TrueFalseQuestionView: View {
    let question: Question
    let answer: String
    let phase: LessonRunnerView.QuestionPhase
    let onChange: (String) -> Void

    var body: some View {
        HStack(spacing: 16) {
            tile(label: "对", value: "对", tint: .green)
            tile(label: "错", value: "错", tint: .red)
        }
    }

    private func tile(label: String, value: String, tint: Color) -> some View {
        let isSelected = answer == value
        return Button {
            if phase == .answering { onChange(value) }
        } label: {
            VStack {
                Image(systemName: value == "对" ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .font(.system(size: 40))
                Text(label).font(.title3.bold())
            }
            .foregroundStyle(isSelected ? .white : tint)
            .frame(maxWidth: .infinity, minHeight: 110)
            .background(isSelected ? tint : tint.opacity(0.12), in: .rect(cornerRadius: 18))
        }
        .buttonStyle(.plain)
        .disabled(phase == .checked)
    }
}

// MARK: - Fill blank (numeric / text)

private struct FillBlankQuestionView: View {
    let question: Question
    let answer: String
    let phase: LessonRunnerView.QuestionPhase
    let onChange: (String) -> Void
    let keyboard: UIKeyboardType

    var body: some View {
        TextField(
            keyboard == .default ? "在这里作答" : "输入数字",
            text: Binding(get: { answer }, set: onChange)
        )
        .keyboardType(keyboard)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .font(.title3)
        .padding()
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 14))
        .disabled(phase == .checked)
    }
}

// MARK: - Word order

private struct WordOrderQuestionView: View {
    let question: Question
    let answer: String
    let phase: LessonRunnerView.QuestionPhase
    let onChange: (String) -> Void

    @State private var picked: [Int] = []

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Picked area
            FlowRow {
                ForEach(picked, id: \.self) { i in
                    chip(text: question.options[i], filled: true) {
                        if phase == .answering { unpick(i) }
                    }
                }
                if picked.isEmpty {
                    Text("点击下方的词语组成句子").foregroundStyle(.secondary).font(.footnote)
                }
            }
            .frame(minHeight: 56, alignment: .topLeading)
            .padding()
            .background(Color(.tertiarySystemFill), in: .rect(cornerRadius: 14))

            Divider()

            // Remaining shelf
            FlowRow {
                ForEach(question.options.indices, id: \.self) { i in
                    if !picked.contains(i) {
                        chip(text: question.options[i], filled: false) {
                            if phase == .answering { pick(i) }
                        }
                    }
                }
            }
        }
        .onChange(of: picked) { _, newValue in
            let text = newValue.map { question.options[$0] }.joined(separator: ",")
            if text != answer { onChange(text) }
        }
    }

    private func pick(_ i: Int) { picked.append(i) }
    private func unpick(_ i: Int) { picked.removeAll { $0 == i } }

    private func chip(text: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(text)
                .font(.body.bold())
                .padding(.horizontal, 14)
                .padding(.vertical, 8)
                .background(
                    filled ? Color.accentColor : Color(.secondarySystemBackground),
                    in: .capsule
                )
                .foregroundStyle(filled ? .white : .primary)
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Matching

private struct MatchingQuestionView: View {
    let question: Question
    let answer: String
    let phase: LessonRunnerView.QuestionPhase
    let onChange: (String) -> Void

    @State private var pairs: [String: String] = [:]   // "A" → "1"
    @State private var activeLeft: String? = nil

    private let leftKeys = ["A", "B", "C", "D"]
    private let rightKeys = ["1", "2", "3", "4"]

    var body: some View {
        let leftItems = Array(question.options.prefix(4))
        let rightItems = Array(question.options.dropFirst(4).prefix(4))

        return HStack(alignment: .top, spacing: 14) {
            VStack(spacing: 10) {
                ForEach(leftKeys.indices, id: \.self) { i in
                    let key = leftKeys[i]
                    let mate = pairs[key]
                    Button {
                        if phase == .answering { tapLeft(key) }
                    } label: {
                        matchTile(label: leftItems[safe: i] ?? "",
                                  badge: mate.map { "→ \($0)" } ?? key,
                                  active: activeLeft == key,
                                  paired: mate != nil)
                    }
                    .buttonStyle(.plain)
                }
            }
            VStack(spacing: 10) {
                ForEach(rightKeys.indices, id: \.self) { i in
                    let key = rightKeys[i]
                    let mateLeft = pairs.first { $0.value == key }?.key
                    Button {
                        if phase == .answering { tapRight(key) }
                    } label: {
                        matchTile(label: rightItems[safe: i] ?? "",
                                  badge: mateLeft.map { "← \($0)" } ?? key,
                                  active: false,
                                  paired: mateLeft != nil)
                    }
                    .buttonStyle(.plain)
                }
            }
        }
        .onChange(of: pairs) { _, _ in
            let text = leftKeys.compactMap { k in pairs[k].map { "\(k)-\($0)" } }.joined(separator: ",")
            if text != answer { onChange(text) }
        }
    }

    private func tapLeft(_ key: String) {
        if pairs[key] != nil { pairs.removeValue(forKey: key); activeLeft = nil; return }
        activeLeft = key
    }

    private func tapRight(_ key: String) {
        guard let left = activeLeft else { return }
        // Remove any prior assignment of this right key
        pairs = pairs.filter { $0.value != key }
        pairs[left] = key
        activeLeft = nil
    }

    private func matchTile(label: String, badge: String, active: Bool, paired: Bool) -> some View {
        HStack(spacing: 8) {
            Text(badge)
                .font(.caption.bold())
                .foregroundStyle(.white)
                .padding(.horizontal, 8).padding(.vertical, 4)
                .background(paired ? Color.green : (active ? Color.accentColor : Color.secondary), in: .capsule)
            Text(label)
                .multilineTextAlignment(.leading)
                .frame(maxWidth: .infinity, alignment: .leading)
        }
        .padding(10)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 12))
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(active ? Color.accentColor : Color.clear, lineWidth: 2)
        )
    }
}

// MARK: - Helpers

private extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}

/// Minimal flow-row layout for chip rows in WordOrderQuestionView.
struct FlowRow<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View {
        // SwiftUI's built-in HStack wraps lines with .lineLimit, so we approximate
        // with a simple WrappingHStack via Layout.
        WrappingHStack { content }
    }
}

private struct WrappingHStack: Layout {
    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let maxW = proposal.width ?? .infinity
        var x: CGFloat = 0, y: CGFloat = 0, lineH: CGFloat = 0, totalW: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width > maxW { x = 0; y += lineH + 6; lineH = 0 }
            x += s.width + 8
            lineH = max(lineH, s.height)
            totalW = max(totalW, x)
        }
        return CGSize(width: maxW.isFinite ? maxW : totalW, height: y + lineH)
    }

    func placeSubviews(in bounds: CGRect, proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) {
        let maxW = bounds.width
        var x = bounds.minX, y = bounds.minY, lineH: CGFloat = 0
        for v in subviews {
            let s = v.sizeThatFits(.unspecified)
            if x + s.width - bounds.minX > maxW { x = bounds.minX; y += lineH + 6; lineH = 0 }
            v.place(at: CGPoint(x: x, y: y), proposal: ProposedViewSize(s))
            x += s.width + 8
            lineH = max(lineH, s.height)
        }
    }
}
