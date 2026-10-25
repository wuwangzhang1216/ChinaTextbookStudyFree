import SwiftUI

/// Duolingo official color palette — ported from tailwind.config.ts DUO object.
/// Names use both "animal aliases" (feather, macaw, cardinal…) from Duo's brand
/// guide and "semantic aliases" (primary, secondary, danger…).
enum DuoColors {
    // MARK: - Green (Feather family)
    static let feather      = Color(hex: 0x58CC02)   // primary green
    static let treeFrog     = Color(hex: 0x58A700)   // button bottom shadow / pressed
    static let maskGreen    = Color(hex: 0x89E219)   // highlight green

    // MARK: - Blue
    static let macaw        = Color(hex: 0x1CB0F6)   // primary blue
    static let whale        = Color(hex: 0x1899D6)   // blue button shadow
    static let iguana       = Color(hex: 0xBBE7FC)   // light blue highlight
    static let humpback     = Color(hex: 0x235390)   // deep blue for dark text
    static let sea          = Color(hex: 0x14D4F4)   // teal

    // MARK: - Red
    static let cardinal     = Color(hex: 0xFF4B4B)   // primary red
    static let fire         = Color(hex: 0xEA2B2B)   // red button shadow

    // MARK: - Yellow / Orange
    static let bee          = Color(hex: 0xFFC800)   // primary yellow / gold
    static let canary       = Color(hex: 0xFFDE00)   // brighter lemon
    static let fox          = Color(hex: 0xFF9600)   // orange (Duo beak)

    // MARK: - Purple
    static let beetle       = Color(hex: 0xCE82FF)

    // MARK: - Neutrals (light → dark)
    static let snow         = Color(hex: 0xFFFFFF)
    static let polar        = Color(hex: 0xF7F7F7)
    static let swan         = Color(hex: 0xE5E5E5)
    static let hare         = Color(hex: 0xAFAFAF)
    static let wolf         = Color(hex: 0x777777)
    static let eel          = Color(hex: 0x4B4B4B)

    // MARK: - Equipped UI theme
    //
    // A purchased `UiThemeData` (Cosmetics.uiThemes) can repaint the brand
    // colors app-wide. Surfaces stay neutral across themes, while filled
    // controls retain white labels. `nil` = stock Duolingo green.
    static var themeOverride: UiThemeData?

    /// Darken a color in HSB — keeps the 3D "ledge" shade in step with a
    /// themed accent instead of leaving it stuck on the stock blue.
    static func darken(_ color: Color, by amount: CGFloat = 0.14) -> Color {
        var h: CGFloat = 0, s: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard UIColor(color).getHue(&h, saturation: &s, brightness: &b, alpha: &a) else { return color }
        return Color(UIColor(hue: h, saturation: s, brightness: max(0, b - amount), alpha: a))
    }

    // MARK: - Semantic aliases (theme-aware)
    static var primary: Color      { themeOverride?.primary ?? feather }
    static var primaryDark: Color  { themeOverride?.primaryDark ?? treeFrog }
    static let primaryLight        = maskGreen

    static var secondary: Color     { themeOverride?.accent ?? macaw }
    static var secondaryDark: Color { themeOverride.map { darken($0.accent) } ?? whale }
    static let secondaryLight       = iguana

    static let danger     = cardinal
    static let dangerDark = fire

    static let warning = bee
    static let gold    = bee

    // Text colors — adapt to light/dark mode automatically so the same
    // token reads as dark-gray on light backgrounds and white-ish on dark.
    static let ink       = adaptive(light: 0x4B4B4B, dark: 0xFFFFFF)
    /// Secondary labels. Light value nudged 0x777777 → 0x707070 (Wave F) so
    /// muted copy clears WCAG AA on white.
    static let inkLight  = adaptive(light: 0x707070, dark: 0x93A7AF)
    /// Decorative only (dividers, chevrons, ghost icons) — NOT for readable
    /// copy; use `inkMuted` for any text a learner is expected to read.
    static let inkSofter = adaptive(light: 0xAFAFAF, dark: 0x52656D)
    /// Alias of `inkLight` — the canonical name for secondary labels.
    static let inkMuted  = inkLight

    // Keep state colors explicit: translucent color over a colored button
    // ledge changes the intended palette and makes option faces look muddy.
    static let successInk = adaptive(light: 0x58A700, dark: 0x89E219)
    static let errorInk = adaptive(light: 0xEA2B2B, dark: 0xFF4B4B)
    static let linkInk = adaptive(light: 0x1899D6, dark: 0x1CB0F6)
    static let selectedFill = adaptive(light: 0xDDF4FF, dark: 0x153F50)
    static let selectedBorder = adaptive(light: 0x84D8FF, dark: 0x1CB0F6)
    static let correctFill = adaptive(light: 0xD7FFB8, dark: 0x234019)
    static let correctBorder = adaptive(light: 0xA5ED6E, dark: 0x58A700)
    static let wrongFill = adaptive(light: 0xFFDFE0, dark: 0x45252B)
    static let wrongBorder = adaptive(light: 0xFFB2B2, dark: 0xEA2B2B)
    static let canvas = bg

    // Surface tokens — soft gray in light, deep navy in dark (Duolingo night).
    static let bgSoft   = adaptive(light: 0xF7F7F7, dark: 0x131F24)
    static let bgSofter = adaptive(light: 0xE5E5E5, dark: 0x37464F)

    // MARK: - Canonical adaptive UI tokens (light-first)
    //
    // These are the surfaces every screen should use. In light mode they read
    // as the classic Duolingo bright theme; in dark mode they become the
    // deep-navy "night" look (the app's original hand-tuned palette).
    static let bg         = adaptive(light: 0xFFFFFF, dark: 0x131F24)   // page background
    static let surface    = adaptive(light: 0xFFFFFF, dark: 0x202F36)   // cards / raised surfaces
    static let surfaceAlt = adaptive(light: 0xF7F7F7, dark: 0x37464F)   // insets / tracks / locked nodes
    static let border     = adaptive(light: 0xE5E5E5, dark: 0x37464F)   // 2pt card borders / dividers

    // Path map — locked node needs a visible 3D ledge in BOTH themes.
    static let lockedNodeTop   = adaptive(light: 0xE5E5E5, dark: 0x37464F)
    static let lockedNodeLedge = adaptive(light: 0xC4C4C4, dark: 0x202F36)

    private static func adaptive(light: UInt32, dark: UInt32) -> Color {
        Color(UIColor { trait in
            let hex = trait.userInterfaceStyle == .dark ? dark : light
            return UIColor(
                red: CGFloat((hex >> 16) & 0xFF) / 255,
                green: CGFloat((hex >> 8) & 0xFF) / 255,
                blue: CGFloat(hex & 0xFF) / 255,
                alpha: 1
            )
        })
    }

    // MARK: - Legacy `dark*` aliases → now adaptive
    //
    // These used to be hardcoded navy. They now forward to the adaptive tokens
    // above, so every existing call site (`DuoColors.darkBg`, etc.) becomes
    // light-first automatically with no rename. New code should prefer the
    // semantic names (`bg`, `surface`, `ink`…).
    static let darkBg         = bg
    static let darkSurface    = surface
    static let darkSurfaceAlt = surfaceAlt
    static let darkDivider    = border
    static let darkInk        = ink
    static let darkInkMuted   = inkMuted
    static let darkInkSofter  = inkSofter

    // MARK: - Fixed navy (only for elements that must stay dark in BOTH themes,
    // e.g. the deep-navy behind the mascot's golden glow). Rarely needed.
    static let navy         = Color(hex: 0x131F24)
    static let navySurface  = Color(hex: 0x202F36)
}

// MARK: - Hex Color Extension

extension Color {
    /// Create a Color from a 24-bit hex integer, e.g. `Color(hex: 0x58CC02)`.
    init(hex: UInt32, opacity: Double = 1.0) {
        self.init(
            .sRGB,
            red: Double((hex >> 16) & 0xFF) / 255,
            green: Double((hex >> 8) & 0xFF) / 255,
            blue: Double(hex & 0xFF) / 255,
            opacity: opacity
        )
    }
}
