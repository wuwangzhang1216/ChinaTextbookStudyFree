import SwiftUI

/// All 6 question type views + the dispatcher that picks one.
///
/// Each sub-view is a controlled component: the parent owns `answer` and
/// `phase` (.answering | .checked); the child calls `onChange` with the
/// stringified answer, mirroring `Grade.gradeAnswer` exactly.

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
            ChoiceQuestionView(question: question, answer: answer, phase: phase, isCorrect: isCorrect, onChange: onChange)
        case .trueFalse:
            TrueFalseQuestionView(question: question, answer: answer, phase: phase, isCorrect: isCorrect, onChange: onChange)
        case .fillBlank, .calculation, .wordProblem:
            FillBlankQuestionView(question: question, answer: answer, phase: phase, isCorrect: isCorrect, onChange: onChange, keyboard: .decimalPad)
        case .fillBlankText:
            FillBlankQuestionView(question: question, answer: answer, phase: phase, isCorrect: isCorrect, onChange: onChange, keyboard: .default)
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
    let isCorrect: Bool?
    let onChange: (String) -> Void

    @State private var shakeTrigger = 0

    var body: some View {
        VStack(spacing: 12) {
            ForEach(Array(question.options.enumerated()), id: \.offset) { i, opt in
                let letter = letterFor(i)
                let isSelected = answer.uppercased() == letter
                let state = cardState(letter: letter, isSelected: isSelected)

                Button {
                    guard phase == .answering else { return }
                    HapticEngine.shared.tap()
                    SFXEngine.shared.play(.tap)
                    withAnimation(Motion.press) { onChange(letter) }
                    if let optAudio = question.audio?.options?[safe: i] ?? nil {
                        AudioPlayer.shared.play(path: optAudio)
                    }
                } label: {
                    HStack(spacing: 12) {
                        // 只做显示转换；判分仍走原始 opt/letter，不受影响。
                        Text(MathText.render(opt))
                            .multilineTextAlignment(.leading)
                            .frame(maxWidth: .infinity, alignment: .leading)
                        checkMark(for: state)
                    }
                    .optionCard(state: state)
                }
                .buttonStyle(OptionCardButtonStyle(state: state))
                .disabled(phase == .checked)
                .modifier(ShakeEffect(animatableData: CGFloat(state == .wrong ? shakeTrigger : 0)))
                .accessibilityAddTraits(isSelected ? .isSelected : [])
                .accessibilityValue(optionA11yValue(for: state))
            }
        }
        .onChange(of: phase) { _, newPhase in
            if newPhase == .checked, isCorrect == false {
                withAnimation(.linear(duration: 0.4)) { shakeTrigger += 1 }
            }
        }
    }

    private func cardState(letter: String, isSelected: Bool) -> OptionCardState {
        guard phase == .checked else { return isSelected ? .selected : .default }
        if Grade.gradeAnswer(question: question, userAnswer: letter) { return .correct }
        if isSelected { return .wrong }
        return .disabled
    }

    private func letterFor(_ i: Int) -> String {
        guard let scalar = Unicode.Scalar(65 + i) else { return "?" }
        return String(scalar)
    }
}

/// VoiceOver：判卷后把「对 / 错」读出来（ios-lesson-21）。
private func optionA11yValue(for state: OptionCardState) -> String {
    switch state {
    case .correct: return "正确答案"
    case .wrong:   return "答错了"
    case .selected: return "已选择"
    default:       return ""
    }
}

@ViewBuilder
private func checkMark(for state: OptionCardState) -> some View {
    switch state {
    case .correct:
        Image(systemName: "checkmark.circle.fill")
            .font(.system(size: 22, weight: .bold))
            .foregroundStyle(DuoColors.successInk)
    case .wrong:
        Image(systemName: "xmark.circle.fill")
            .font(.system(size: 22, weight: .bold))
            .foregroundStyle(DuoColors.errorInk)
    default:
        EmptyView()
    }
}

// MARK: - True / False

private struct TrueFalseQuestionView: View {
    let question: Question
    let answer: String
    let phase: LessonRunnerView.QuestionPhase
    let isCorrect: Bool?
    let onChange: (String) -> Void

    @State private var shakeTrigger = 0

    var body: some View {
        HStack(spacing: 16) {
            tile(label: "对", value: "对", icon: "checkmark.circle.fill")
            tile(label: "错", value: "错", icon: "xmark.circle.fill")
        }
        .onChange(of: phase) { _, newPhase in
            if newPhase == .checked, isCorrect == false {
                withAnimation(.linear(duration: 0.4)) { shakeTrigger += 1 }
            }
        }
    }

    private func tile(label: String, value: String, icon: String) -> some View {
        let isSelected = answer == value
        let state = tfCardState(value: value, isSelected: isSelected)
        return Button {
            guard phase == .answering else { return }
            HapticEngine.shared.tap()
            SFXEngine.shared.play(.tap)
            withAnimation(Motion.press) { onChange(value) }
        } label: {
            VStack(spacing: 8) {
                Image(systemName: icon).font(.system(size: 36))
                Text(label).duoFont(.subhead)
            }
            .frame(maxWidth: .infinity, minHeight: 110)
            .optionCard(state: state)
        }
        .buttonStyle(OptionCardButtonStyle(state: state))
        .disabled(phase == .checked)
        .modifier(ShakeEffect(animatableData: CGFloat(state == .wrong ? shakeTrigger : 0)))
        .accessibilityIdentifier("tf-\(value)")
        .accessibilityAddTraits(isSelected ? .isSelected : [])
        .accessibilityValue(optionA11yValue(for: state))
    }

    private func tfCardState(value: String, isSelected: Bool) -> OptionCardState {
        guard phase == .checked else { return isSelected ? .selected : .default }
        if Grade.gradeAnswer(question: question, userAnswer: value) { return .correct }
        if isSelected { return .wrong }
        return .disabled
    }
}

// MARK: - Fill blank (numeric / text)

private struct FillBlankQuestionView: View {
    let question: Question
    let answer: String
    let phase: LessonRunnerView.QuestionPhase
    let isCorrect: Bool?
    let onChange: (String) -> Void
    let keyboard: UIKeyboardType

    @State private var shakeTrigger = 0

    private var state: OptionCardState {
        guard phase == .checked else { return answer.isEmpty ? .default : .selected }
        return (isCorrect ?? false) ? .correct : .wrong
    }

    var body: some View {
        TextField(
            keyboard == .default ? "在这里作答" : "输入数字",
            text: Binding(get: { answer }, set: onChange),
            prompt: Text(keyboard == .default ? "在这里作答" : "输入数字")
                .foregroundStyle(DuoColors.inkSofter)
        )
        .keyboardType(keyboard)
        .textInputAutocapitalization(.never)
        .autocorrectionDisabled()
        .font(.system(size: 20, weight: .heavy, design: .rounded))
        .foregroundStyle(fieldForeground)
        .padding(.horizontal, 18)
        .padding(.vertical, 18)
        .background(fieldBackground, in: .rect(cornerRadius: Radius.card))
        .overlay {
            RoundedRectangle(cornerRadius: Radius.card)
                .strokeBorder(fieldBorder, lineWidth: state == .default ? 2 : 2.5)
        }
        .modifier(ShakeEffect(animatableData: CGFloat(shakeTrigger)))
        .disabled(phase == .checked)
        .animation(Motion.reveal, value: state)
        .onChange(of: phase) { _, newPhase in
            if newPhase == .checked, isCorrect == false {
                withAnimation(.linear(duration: 0.4)) { shakeTrigger += 1 }
            }
        }
    }

    private var fieldBackground: Color {
        switch state {
        case .correct: return DuoColors.correctFill
        case .wrong:   return DuoColors.wrongFill
        case .selected: return DuoColors.selectedFill
        default:       return DuoColors.surface
        }
    }
    private var fieldBorder: Color {
        switch state {
        case .correct: return DuoColors.correctBorder
        case .wrong:   return DuoColors.wrongBorder
        case .selected: return DuoColors.selectedBorder
        default:       return DuoColors.border
        }
    }
    private var fieldForeground: Color {
        switch state {
        case .correct: return DuoColors.successInk
        case .wrong:   return DuoColors.errorInk
        default:       return DuoColors.ink
        }
    }
}

// MARK: - Word order

private struct WordOrderQuestionView: View {
    let question: Question
    let answer: String
    let phase: LessonRunnerView.QuestionPhase
    let onChange: (String) -> Void

    @State private var picked: [Int] = []
    @Namespace private var ns

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            // Answer line — underline placeholders + picked chips that fly in.
            ZStack(alignment: .topLeading) {
                VStack(alignment: .leading, spacing: 36) {
                    ForEach(0..<2, id: \.self) { _ in
                        Rectangle()
                            .fill(DuoColors.border)
                            .frame(height: 2)
                            .frame(maxWidth: .infinity)
                    }
                }
                .padding(.top, 32)
                .padding(.horizontal, 4)

                FlowRow {
                    ForEach(picked, id: \.self) { i in
                        chip(text: question.options[i], filled: true) {
                            if phase == .answering { unpick(i) }
                        }
                        .matchedGeometryEffect(id: i, in: ns)
                    }
                }
                .frame(minHeight: 72, alignment: .topLeading)
            }
            .frame(minHeight: 120, alignment: .top)

            // Shelf — unpicked chips; picked slots leave a dim ghost so the
            // shelf doesn't reflow as tiles fly up.
            FlowRow {
                ForEach(question.options.indices, id: \.self) { i in
                    if picked.contains(i) {
                        chipGhost(text: question.options[i])
                    } else {
                        chip(text: question.options[i], filled: false) {
                            if phase == .answering { pick(i) }
                        }
                        .matchedGeometryEffect(id: i, in: ns)
                    }
                }
            }

            // 答错后把正确答案拼成可读的句子展示（ios-lesson-21）：
            // 英文词块空格连接，中文直接连接，不再露出逗号串。
            if phase == .checked, !Grade.gradeAnswer(question: question, userAnswer: answer) {
                VStack(alignment: .leading, spacing: 4) {
                    Text("正确的句子是：")
                        .duoFont(.caption)
                        .foregroundStyle(DuoColors.inkMuted)
                    Text(MathText.render(WordOrderFormat.readableAnswer(question.answer)))
                        .duoFont(.subhead)
                        .foregroundStyle(DuoColors.primary)
                        .multilineTextAlignment(.leading)
                }
                .padding(12)
                .frame(maxWidth: .infinity, alignment: .leading)
                .background(DuoColors.primary.opacity(0.08), in: .rect(cornerRadius: Radius.card))
                .transition(.opacity)
            }
        }
        .onChange(of: picked) { _, newValue in
            let text = newValue.map { question.options[$0] }.joined(separator: ",")
            if text != answer { onChange(text) }
        }
    }

    private func pick(_ i: Int) {
        HapticEngine.shared.tap(); SFXEngine.shared.play(.tap)
        withAnimation(Motion.reveal) { picked.append(i) }
    }
    private func unpick(_ i: Int) {
        HapticEngine.shared.tap(); SFXEngine.shared.play(.tap)
        withAnimation(Motion.reveal) { picked.removeAll { $0 == i } }
    }

    private func chip(text: String, filled: Bool, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(MathText.render(text))
                .duoFont(.subhead)
                .padding(.horizontal, 16)
                .padding(.vertical, 12)
                .foregroundStyle(filled ? DuoColors.primary : DuoColors.ink)
                .background(DuoColors.surface, in: .capsule)
                .overlay {
                    Capsule().strokeBorder(filled ? DuoColors.primary : DuoColors.border, lineWidth: 2)
                }
        }
        // ios-feel-9：词块 3pt 底座按压（与大按钮同款手感）。
        .buttonStyle(ChunkyChipStyle(
            ledgeColor: filled ? DuoColors.primaryDark : DuoColors.border,
            isCapsule: true
        ))
    }

    private func chipGhost(text: String) -> some View {
        Text(MathText.render(text))
            .duoFont(.subhead)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .foregroundStyle(.clear)
            .background(DuoColors.surfaceAlt.opacity(0.5), in: .capsule)
            // 底座样式给真词块加了 3pt 底边距，幽灵占位补齐防止货架抖动。
            .padding(.bottom, 3)
    }
}

/// wordOrder 正确答案的「人话」格式化：
/// 含英文/拉丁词块 → 空格连接；纯中文 → 直接连接。
enum WordOrderFormat {
    static func readableAnswer(_ answer: String) -> String {
        let parts = answer
            .split(separator: ",")
            .map { $0.trimmingCharacters(in: .whitespaces) }
            .filter { !$0.isEmpty }
        guard !parts.isEmpty else { return answer }
        let hasLatin = parts.contains { $0.range(of: "[A-Za-z]", options: .regularExpression) != nil }
        return parts.joined(separator: hasLatin ? " " : "")
    }
}

// MARK: - Matching (flash-green-and-vanish)

private struct MatchingQuestionView: View {
    let question: Question
    let answer: String
    let phase: LessonRunnerView.QuestionPhase
    let onChange: (String) -> Void

    @State private var pairs: [String: String] = [:]     // "A" → "1" (confirmed correct)
    @State private var matched: Set<String> = []          // left keys resolved & hidden
    @State private var activeLeft: String? = nil
    @State private var flashWrong: (left: String, right: String)? = nil
    @State private var shakeTrigger = 0

    private let leftKeys = ["A", "B", "C", "D"]
    private let rightKeys = ["1", "2", "3", "4"]

    private var correctMap: [String: String] { Grade.matchingPairs(question.answer) }

    var body: some View {
        let leftItems = Array(question.options.prefix(4))
        let rightItems = Array(question.options.dropFirst(4).prefix(4))

        return HStack(alignment: .top, spacing: 14) {
            VStack(spacing: 10) {
                ForEach(leftKeys.indices, id: \.self) { i in
                    let key = leftKeys[i]
                    if !matched.contains(key) {
                        Button { if phase == .answering { tapLeft(key) } } label: {
                            matchTile(label: leftItems[safe: i] ?? "", side: .left, key: key)
                        }
                        .buttonStyle(ChunkyChipStyle(ledgeColor: tileLedge(side: .left, key: key), isCapsule: false))
                        .modifier(ShakeEffect(animatableData: CGFloat(flashWrong?.left == key ? shakeTrigger : 0)))
                    } else {
                        matchedGhost()
                    }
                }
            }
            VStack(spacing: 10) {
                ForEach(rightKeys.indices, id: \.self) { i in
                    let key = rightKeys[i]
                    let ownerLeft = matched.first { matched.contains($0) && correctMap[$0] == key }
                    if ownerLeft == nil {
                        Button { if phase == .answering { tapRight(key) } } label: {
                            matchTile(label: rightItems[safe: i] ?? "", side: .right, key: key)
                        }
                        .buttonStyle(ChunkyChipStyle(ledgeColor: tileLedge(side: .right, key: key), isCapsule: false))
                        .modifier(ShakeEffect(animatableData: CGFloat(flashWrong?.right == key ? shakeTrigger : 0)))
                    } else {
                        matchedGhost()
                    }
                }
            }
        }
    }

    private enum Side { case left, right }

    private func tapLeft(_ key: String) {
        HapticEngine.shared.tap(); SFXEngine.shared.play(.tap)
        activeLeft = (activeLeft == key) ? nil : key
    }

    private func tapRight(_ key: String) {
        guard let left = activeLeft else { return }
        if correctMap[left] == key {
            // Correct pair — flash green, then vanish both tiles.
            // ios-feel-10：配对成功播上行双音，每多配一对整体升一级音高。
            HapticEngine.shared.correct()
            SFXEngine.shared.play(.pairMatch, pitchStep: matched.count)
            pairs[left] = key
            withAnimation(Motion.reveal) {
                _ = matched.insert(left)
                activeLeft = nil
            }
            if matched.count == leftKeys.count { commitAllMatched() }
        } else {
            // Wrong — flash red + shake, then deselect.
            HapticEngine.shared.wrong()
            flashWrong = (left, key)
            withAnimation(.linear(duration: 0.4)) { shakeTrigger += 1 }
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                flashWrong = nil
                activeLeft = nil
            }
        }
    }

    /// When every pair is matched, hand the grader the canonical string.
    private func commitAllMatched() {
        let text = leftKeys.compactMap { k in correctMap[k].map { "\(k)-\($0)" } }.joined(separator: ",")
        onChange(text)
    }

    /// 方块底座颜色：跟着激活 / 错误状态换色，底座与描边一体。
    private func tileLedge(side: Side, key: String) -> Color {
        let isActive = side == .left && activeLeft == key
        let isWrong = (side == .left && flashWrong?.left == key) || (side == .right && flashWrong?.right == key)
        if isWrong { return DuoColors.dangerDark }
        if isActive { return DuoColors.secondaryDark }
        return DuoColors.border
    }

    private func matchedGhost() -> some View {
        RoundedRectangle(cornerRadius: Radius.card)
            .fill(DuoColors.surfaceAlt.opacity(0.4))
            .frame(maxWidth: .infinity)
            .frame(height: 52)
            .overlay {
                Image(systemName: "checkmark")
                    .font(.system(size: 16, weight: .heavy))
                    .foregroundStyle(DuoColors.primary.opacity(0.6))
            }
            // 补齐底座样式的 3pt 底边距，两列高度保持对齐。
            .padding(.bottom, 3)
    }

    private func matchTile(label: String, side: Side, key: String) -> some View {
        let isActive = side == .left && activeLeft == key
        let isWrong = (side == .left && flashWrong?.left == key) || (side == .right && flashWrong?.right == key)
        let border: Color = isWrong ? DuoColors.danger : (isActive ? DuoColors.secondary : DuoColors.border)
        let fill: Color = isWrong ? DuoColors.danger.opacity(0.14) : (isActive ? DuoColors.secondary.opacity(0.12) : DuoColors.surface)
        return Text(MathText.render(label))
            .duoFont(.subhead)
            .foregroundStyle(DuoColors.ink)
            .multilineTextAlignment(.leading)
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(12)
            .frame(minHeight: 52)
            .background(fill, in: .rect(cornerRadius: Radius.card))
            .overlay {
                RoundedRectangle(cornerRadius: Radius.card)
                    .strokeBorder(border, lineWidth: isActive || isWrong ? 2.5 : 2)
            }
            .animation(Motion.press, value: isActive)
    }
}

// MARK: - Helpers

private extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}

/// Minimal flow-row layout for chip rows.
struct FlowRow<Content: View>: View {
    @ViewBuilder var content: Content
    var body: some View { WrappingHStack { content } }
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
