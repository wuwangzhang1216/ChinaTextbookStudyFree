import SwiftUI

/// State of an option card in a quiz question.
enum OptionCardState: Equatable {
    case `default`    // neutral dark surface with thin border
    case selected     // blue fill + blue border
    case correct      // pale green face + green border and label
    case wrong        // pale red face + red border and label
    case disabled     // grayed out, non-interactive
}

/// Flat option faces with a crisp 2pt border. State fills are opaque and
/// adaptive; depth comes from the button's bottom ledge, never a blurred glow.
struct OptionCardModifier: ViewModifier {
    let state: OptionCardState

    // ios-feel-19: 与 OptionCardButtonStyle 的底座圆角(Radius.card)统一，
    // 卡片面和 3D 底座才能严丝合缝。
    private let cornerRadius: CGFloat = Radius.card

    func body(content: Content) -> some View {
        content
            .duoFont(.subhead, weight: .semibold)
            .foregroundStyle(foregroundColor)
            .frame(maxWidth: .infinity, alignment: .leading)
            .frame(minHeight: 60)
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(backgroundColor, in: .rect(cornerRadius: cornerRadius))
            .background(DuoColors.surface, in: .rect(cornerRadius: cornerRadius))
            .overlay {
                RoundedRectangle(cornerRadius: cornerRadius)
                    .strokeBorder(borderColor, lineWidth: borderWidth)
            }
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: state)
    }

    private var borderWidth: CGFloat {
        2
    }

    private var borderColor: Color {
        switch state {
        case .default:  return DuoColors.darkSurfaceAlt
        case .selected: return DuoColors.selectedBorder
        case .correct:  return DuoColors.correctBorder
        case .wrong:    return DuoColors.wrongBorder
        case .disabled: return DuoColors.border
        }
    }

    private var backgroundColor: Color {
        switch state {
        case .default:  return DuoColors.darkSurface
        case .selected: return DuoColors.selectedFill
        case .correct:  return DuoColors.correctFill
        case .wrong:    return DuoColors.wrongFill
        case .disabled: return DuoColors.surface
        }
    }

    private var foregroundColor: Color {
        switch state {
        case .default:  return DuoColors.darkInk
        case .selected: return DuoColors.linkInk
        case .correct:  return DuoColors.successInk
        case .wrong:    return DuoColors.errorInk
        case .disabled: return DuoColors.darkInkSofter
        }
    }

}

extension View {
    func optionCard(state: OptionCardState) -> some View {
        modifier(OptionCardModifier(state: state))
    }
}

/// The darker "ledge" color that peeks below an option card, giving it the
/// same pressable 3D depth as ChunkyButton.
extension OptionCardState {
    var ledgeColor: Color {
        switch self {
        case .default:  return DuoColors.border
        case .selected: return DuoColors.selectedBorder
        case .correct:  return DuoColors.correctBorder
        case .wrong:    return DuoColors.wrongBorder
        case .disabled: return DuoColors.border
        }
    }
}

/// Button style that gives an `.optionCard`-decorated label a 3D bottom ledge
/// and a satisfying press-down (mirrors ChunkyButtonStyle for consistency).
/// Pass the current `OptionCardState` so the ledge tints to match.
struct OptionCardButtonStyle: ButtonStyle {
    let state: OptionCardState
    private let depth: CGFloat = 4
    private let radius: CGFloat = Radius.card

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        ZStack {
            RoundedRectangle(cornerRadius: radius)
                .fill(state.ledgeColor)
                .offset(y: depth)
            configuration.label
                .offset(y: pressed ? depth : 0)
        }
        .padding(.bottom, depth)
        .animation(Motion.press, value: pressed)
    }
}

/// 3pt 小底座按压样式 — 给词块（capsule）和配对方块（rounded rect）一个
/// 和大按钮同款的「按下去」手感（Wave F ios-feel-9/10）。
///
/// 用法：label 自己画面（背景 + 边框），本样式在下面垫一层 `ledgeColor`
/// 底座；按下时面片下沉到底座上，底座不动。
struct ChunkyChipStyle: ButtonStyle {
    var ledgeColor: Color = DuoColors.border
    /// true = capsule 词块；false = Radius.card 圆角方块。
    var isCapsule: Bool = true
    var depth: CGFloat = 3

    private var ledgeShape: AnyShape {
        isCapsule ? AnyShape(Capsule()) : AnyShape(RoundedRectangle(cornerRadius: Radius.card))
    }

    func makeBody(configuration: Configuration) -> some View {
        let pressed = configuration.isPressed
        ZStack {
            ledgeShape
                .fill(ledgeColor)
                .offset(y: depth)
            configuration.label
                .offset(y: pressed ? depth : 0)
        }
        .padding(.bottom, depth)
        .animation(Motion.press, value: pressed)
    }
}
