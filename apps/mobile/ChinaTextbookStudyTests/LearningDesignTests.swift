import XCTest
import SwiftUI
@testable import ChinaTextbookStudy

final class LearningDesignTests: XCTestCase {
    @MainActor
    func testControlLabelsMeetContrastAcrossPurchasedThemes() {
        func luminance(_ color: Color) -> Double {
            var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
            XCTAssertTrue(UIColor(color).getRed(&r, green: &g, blue: &b, alpha: &a))
            func linear(_ v: CGFloat) -> Double {
                v <= 0.04045 ? Double(v) / 12.92 : pow((Double(v) + 0.055) / 1.055, 2.4)
            }
            return 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b)
        }
        let colors = [DuoColors.feather, DuoColors.macaw, DuoColors.cardinal, DuoColors.fox]
            + Cosmetics.uiThemes.flatMap { [$0.data.primary, $0.data.accent] }
        for background in colors {
            let bg = luminance(background)
            let fg = luminance(DuoColors.readableInk(on: background))
            let ratio = (max(bg, fg) + 0.05) / (min(bg, fg) + 0.05)
            XCTAssertGreaterThanOrEqual(ratio, 4.5, "Control text must remain legible after changing themes")
        }
    }
}
