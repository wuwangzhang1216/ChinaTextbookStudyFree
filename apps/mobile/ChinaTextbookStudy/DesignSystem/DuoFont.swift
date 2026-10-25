import SwiftUI
import UIKit

/// Role-based typography — the app's single type scale.
///
/// Duolingo's personality lives in one heavy, rounded typeface applied on a
/// small, strict scale. We use SF Rounded (`design: .rounded`) at eight roles
/// instead of the ~30 ad-hoc `.font(.system(size:))` sizes that were scattered
/// across the app. Prefer `.duoFont(.heading)` over raw sizes in new code.
///
/// Wave F: roles are now真正 Dynamic Type aware — each role scales via
/// `UIFontMetrics(forTextStyle:)` relative to its mapped text style, so the
/// whole app grows/shrinks with the user's 字体大小 setting. The two smallest
/// roles (`caption` / `micro`) are capped at ~1.35× so metadata chips never
/// blow up a layout at accessibility sizes.
enum DuoFont: CaseIterable {
    case display    // 34 — result splash, big numbers
    case title      // 28 — screen titles
    case heading    // 22 — section / question instruction
    case subhead    // 18 — card titles, emphasized body
    case body       // 16 — default reading text
    case button     // 17 — chunky button labels
    case caption    // 13 — metadata, chips
    case micro      // 11 — tiny labels, badges

    /// Base (Large / default content size) point size of the role.
    var size: CGFloat {
        switch self {
        case .display: return 34
        case .title:   return 28
        case .heading: return 22
        case .subhead: return 18
        case .body:    return 16
        case .button:  return 17
        case .caption: return 13
        case .micro:   return 11
        }
    }

    var weight: Font.Weight {
        switch self {
        case .display, .title, .heading, .button: return .bold
        case .subhead, .micro:                     return .semibold
        case .caption:                             return .medium
        case .body:                               return .regular
        }
    }

    /// The `TextStyle` this role scales relative to (for Dynamic Type).
    var relativeTo: Font.TextStyle {
        switch self {
        case .display: return .largeTitle
        case .title:   return .title
        case .heading: return .title2
        case .subhead: return .title3
        case .body:    return .body
        case .button:  return .headline
        case .caption: return .footnote
        case .micro:   return .caption2
        }
    }

    /// UIKit twin of `relativeTo` — feeds `UIFontMetrics`.
    var uiTextStyle: UIFont.TextStyle {
        switch self {
        case .display: return .largeTitle
        case .title:   return .title1
        case .heading: return .title2
        case .subhead: return .title3
        case .body:    return .body
        case .button:  return .headline
        case .caption: return .footnote
        case .micro:   return .caption2
        }
    }

    /// Growth ceiling as a multiple of the base size. The two metadata roles
    /// are clamped (~1.35×) so chips/badges stay chip-sized even at XXL;
    /// reading roles are left free to grow with the system curve.
    var maxScaleFactor: CGFloat? {
        switch self {
        case .caption, .micro: return 1.35
        default: return nil
        }
    }

    /// Point size scaled for a given content size category via `UIFontMetrics`,
    /// with the role's cap applied. Pure — unit-testable with any category.
    func scaledSize(for category: UIContentSizeCategory) -> CGFloat {
        let traits = UITraitCollection(preferredContentSizeCategory: category)
        let scaled = UIFontMetrics(forTextStyle: uiTextStyle)
            .scaledValue(for: size, compatibleWith: traits)
        if let cap = maxScaleFactor {
            return min(scaled, size * cap)
        }
        return scaled
    }

    /// Scaled for the app's current content size (non-View contexts).
    var scaledSize: CGFloat {
        scaledSize(for: UIApplication.shared.preferredContentSizeCategory)
    }

    var font: Font {
        .system(size: scaledSize, weight: weight, design: .rounded)
    }
}

// MARK: - SwiftUI plumbing

/// Bridge SwiftUI's `DynamicTypeSize` to `UIContentSizeCategory` so the
/// modifier below re-computes whenever the user changes 字体大小.
extension UIContentSizeCategory {
    init(_ typeSize: DynamicTypeSize) {
        switch typeSize {
        case .xSmall:         self = .extraSmall
        case .small:          self = .small
        case .medium:         self = .medium
        case .large:          self = .large
        case .xLarge:         self = .extraLarge
        case .xxLarge:        self = .extraExtraLarge
        case .xxxLarge:       self = .extraExtraExtraLarge
        case .accessibility1: self = .accessibilityMedium
        case .accessibility2: self = .accessibilityLarge
        case .accessibility3: self = .accessibilityExtraLarge
        case .accessibility4: self = .accessibilityExtraExtraLarge
        case .accessibility5: self = .accessibilityExtraExtraExtraLarge
        @unknown default:     self = .large
        }
    }
}

/// Reads the environment's dynamic type size so the font re-resolves live
/// when the setting changes (a plain `.font(...)` computed once would not).
private struct DuoFontModifier: ViewModifier {
    @Environment(\.dynamicTypeSize) private var dynamicTypeSize
    let role: DuoFont
    let weight: Font.Weight?
    let monospacedDigit: Bool

    func body(content: Content) -> some View {
        let size = role.scaledSize(for: UIContentSizeCategory(dynamicTypeSize))
        let font = Font.system(size: size, weight: weight ?? role.weight, design: .rounded)
        content.font(monospacedDigit ? font.monospacedDigit() : font)
    }
}

extension View {
    /// Apply a typography role. Optionally override the weight for one-offs.
    func duoFont(_ role: DuoFont, weight: Font.Weight? = nil) -> some View {
        modifier(DuoFontModifier(role: role, weight: weight, monospacedDigit: false))
    }

    /// Numeric text that shouldn't jitter as digits change (XP, streak, timers).
    func duoNumeral(_ role: DuoFont, weight: Font.Weight? = nil) -> some View {
        modifier(DuoFontModifier(role: role, weight: weight ?? .heavy, monospacedDigit: true))
    }
}

extension Font {
    /// Non-View contexts (e.g. `Text(...).font(DuoFont.body.font)`), and
    /// convenience for `prompt:` / attributed strings. Scales with the app's
    /// current content size category (not live-updating like `.duoFont`).
    static func duo(_ role: DuoFont, weight: Font.Weight? = nil) -> Font {
        .system(size: role.scaledSize, weight: weight ?? role.weight, design: .rounded)
    }
}
