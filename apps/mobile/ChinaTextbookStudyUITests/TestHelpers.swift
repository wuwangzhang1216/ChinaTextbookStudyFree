import XCTest
import UIKit

extension XCTestCase {
    /// Skip the current test on iPad destinations. Several tests were written
    /// against the iPhone-style single NavigationStack; the iPad
    /// NavigationSplitView has a different back-navigation model and needs
    /// its own coverage in `LayoutUITests`.
    func skipIfIPad() throws {
        if UIDevice.current.userInterfaceIdiom == .pad {
            throw XCTSkip("Test is iPhone-only; iPad layout covered by LayoutUITests")
        }
    }
}
