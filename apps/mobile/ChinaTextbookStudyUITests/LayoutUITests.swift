import XCTest

/// Layout regression coverage for Phase 7.
/// These tests are destination-agnostic: iPhone runs exercise the compact
/// NavigationStack path, iPad runs exercise the NavigationSplitView path.
final class LayoutUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testSidebarOnRegularWidth() throws {
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.navigationBars["课本学习"].waitForExistence(timeout: 5))

        // Attach the launch screenshot unconditionally so we have proof even
        // when the sidebar isn't present (iPhone compact).
        attach(name: "shell-launch")

        guard UIDevice.current.userInterfaceIdiom == .pad else {
            // Nothing more to assert on compact width — that layout is covered
            // by LessonFlowUITests etc.
            return
        }

        // Regular width — the sidebar List renders the rows as cells
        // (not plain UIButtons). Query them via `cells` and match the label.
        let reviewCell = app.cells.containing(
            NSPredicate(format: "label CONTAINS %@", "错题本")
        ).firstMatch
        XCTAssertTrue(reviewCell.waitForExistence(timeout: 3),
                      "sidebar 错题本 row not found on iPad")
        let achievementsCell = app.cells.containing(
            NSPredicate(format: "label CONTAINS %@", "成就墙")
        ).firstMatch
        XCTAssertTrue(achievementsCell.waitForExistence(timeout: 3))

        // Tap the achievements sidebar entry and verify navigation swap.
        achievementsCell.tap()
        XCTAssertTrue(app.navigationBars["成就墙"].waitForExistence(timeout: 3))
        attach(name: "ipad-split-achievements")
    }

    @MainActor
    private func attach(name: String) {
        let snap = XCUIScreen.main.screenshot()
        let att = XCTAttachment(screenshot: snap)
        att.name = name
        att.lifetime = .keepAlways
        add(att)
    }

    @MainActor
    func testDarkModeRenders() throws {
        let app = XCUIApplication()
        app.launchArguments.append("-AppleInterfaceStyle")
        app.launchArguments.append("Dark")
        app.launch()
        XCTAssertTrue(app.navigationBars["课本学习"].waitForExistence(timeout: 5))

        let snap = XCUIScreen.main.screenshot()
        let att = XCTAttachment(screenshot: snap)
        att.name = "dark-mode-home"
        att.lifetime = .keepAlways
        add(att)
    }
}
