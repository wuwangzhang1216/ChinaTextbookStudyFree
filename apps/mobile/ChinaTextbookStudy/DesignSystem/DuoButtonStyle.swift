import SwiftUI

/// Duolingo-style "chunky" 3D button — two-layer ZStack approach.
///
/// A darker rounded rect sits behind the main surface, peeking out 4px
/// at the bottom. On press the main surface shifts down to meet it,
/// creating the satisfying "click" feel. No `.shadow()` — no ghosting.
struct ChunkyButtonStyle: ButtonStyle {
    enum Variant {
        case primary, secondary, danger, ghost, disabled
    }

    var variant: Variant

    init(_ variant: Variant = .primary) {
        self.variant = variant
    }

    private let cornerRadius: CGFloat = Radius.control
    private let depth: CGFloat = 4

    func makeBody(configuration: Configuration) -> some View {
        let isPressed = configuration.isPressed
        let colors = resolveColors()
        let pressOffset: CGFloat = isPressed ? depth : 0

        ZStack {
            // Bottom "depth" layer — always visible behind the surface.
            // Same width + radius as the surface (no horizontal padding here:
            // the surface's padding sits INSIDE its background, so padding the
            // base would leave it 24pt short on each side).
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(isPressed ? colors.background : colors.shadow)
                .frame(minHeight: 50)

            // Main surface layer — shifts down on press
            configuration.label
                .duoFont(.button)
                .foregroundStyle(colors.foreground)
                .frame(maxWidth: .infinity)
                .frame(minHeight: 50)
                .padding(.horizontal, 20)
                .background(colors.background, in: RoundedRectangle(cornerRadius: cornerRadius))
                .overlay {
                    if variant == .ghost {
                        RoundedRectangle(cornerRadius: cornerRadius)
                            .strokeBorder(DuoColors.border, lineWidth: 2)
                    }
                }
                .offset(y: pressOffset - depth)
        }
        .frame(minHeight: 50 + depth)
        .fixedSize(horizontal: false, vertical: true)
        .scaleEffect(isPressed ? 0.99 : 1.0)
        .animation(Motion.press, value: isPressed)
        .allowsHitTesting(variant != .disabled)
    }

    private struct ResolvedColors {
        let background: Color
        let foreground: Color
        let shadow: Color
    }

    private func resolveColors() -> ResolvedColors {
        switch variant {
        case .primary:
            return ResolvedColors(background: DuoColors.primary, foreground: .white, shadow: DuoColors.primaryDark)
        case .secondary:
            return ResolvedColors(background: DuoColors.secondary, foreground: .white, shadow: DuoColors.secondaryDark)
        case .danger:
            return ResolvedColors(background: DuoColors.danger, foreground: .white, shadow: DuoColors.dangerDark)
        case .ghost:
            return ResolvedColors(background: DuoColors.surface, foreground: DuoColors.secondary, shadow: DuoColors.border)
        case .disabled:
            return ResolvedColors(background: DuoColors.bgSofter, foreground: DuoColors.inkSofter, shadow: DuoColors.bgSofter)
        }
    }
}

/// Small inline variant (e.g. review "我会了" buttons).
struct ChunkySmallButtonStyle: ButtonStyle {
    var background: Color = DuoColors.primary
    var shadowColor: Color = DuoColors.primaryDark
    private let depth: CGFloat = 3
    private let cornerRadius: CGFloat = Radius.control

    func makeBody(configuration: Configuration) -> some View {
        let isPressed = configuration.isPressed
        ZStack {
            RoundedRectangle(cornerRadius: cornerRadius)
                .fill(isPressed ? background : shadowColor)
                .frame(minHeight: 44)

            configuration.label
                .duoFont(.caption)
                .foregroundStyle(.white)
                .padding(.horizontal, 12)
                .frame(minHeight: 44)
                .background(background, in: RoundedRectangle(cornerRadius: cornerRadius))
                .offset(y: isPressed ? 0 : -depth)
        }
        .frame(minHeight: 44 + depth)
        .fixedSize(horizontal: true, vertical: true)
        .animation(Motion.press, value: isPressed)
    }
}
