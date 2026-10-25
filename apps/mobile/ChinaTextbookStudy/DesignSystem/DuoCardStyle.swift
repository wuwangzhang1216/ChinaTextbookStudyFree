import SwiftUI

/// State of an option card in a quiz question.
enum OptionCardState: Equatable {
    case `default`    // neutral dark surface with thin border
    case selected     // blue fill + blue border
    case correct      // green fill + green border + glow
    case wrong        // red fill + red border + glow
    case disabled     // grayed out, non-interactive
}

/// Duolingo-style option card modifier — dark night-mode palette.
///
/// Reference (Duolingo iOS dark):
/// - surface: slightly lighter than page bg (#202F36 on #131F24)
/// - border: 2pt thin line (#37464F)
/// - no heavy shadow in default state; colored glow only when correct/wrong
struct OptionCardModifier: ViewModifier {
    let state: OptionCardState

    // ios-feel-19: 与 OptionCardButtonStyle 的底座圆角(Radius.card)统一，
    // 卡片面和 3D 底座才能严丝合缝。
    private let cornerRadius: CGFloat = Radius.card

    func body(content: Content) -> some View {
        content
            .font(.body.weight(.heavy))
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
            .shadow(color: glowColor, radius: 4, x: 0, y: 0)
            .animation(.spring(response: 0.25, dampingFraction: 0.7), value: state)
    }

    private var borderWidth: CGFloat {
        switch state {
        case .default, .disabled: return 2
        default:                  return 2.5
        }
    }

    private var borderColor: Color {
        switch state {
        case .default:  return DuoColors.darkSurfaceAlt
        case .selected: return DuoColors.linkInk
        case .correct:  return DuoColors.successInk
        case .wrong:    return DuoColors.errorInk
        case .disabled: return DuoColors.darkSurfaceAlt.opacity(0.5)
        }
    }

    private var backgroundColor: Color {
        switch state {
        case .default:  return DuoColors.darkSurface
        case .selected: return DuoColors.secondary.opacity(0.18)
        case .correct:  return DuoColors.primary.opacity(0.22)
        case .wrong:    return DuoColors.danger.opacity(0.20)
        case .disabled: return DuoColors.darkSurface.opacity(0.5)
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

    private var glowColor: Color {
        switch state {
        case .correct:  return DuoColors.primary.opacity(0.35)
        case .wrong:    return DuoColors.danger.opacity(0.30)
        default:        return .clear
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
        case .selected: return DuoColors.secondaryDark
        case .correct:  return DuoColors.primaryDark
        case .wrong:    return DuoColors.dangerDark
        case .disabled: return DuoColors.border.opacity(0.5)
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
