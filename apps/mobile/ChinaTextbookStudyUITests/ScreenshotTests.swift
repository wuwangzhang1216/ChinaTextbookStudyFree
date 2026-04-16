import XCTest

/// Walks the secondary screens and attaches a screenshot of each so the
/// developer can see the rendered state without manual simulator interaction.
final class ScreenshotTests: XCTestCase {
    @MainActor
    func testCaptureSecondaryScreens() throws {
        try skipIfIPad()
        let app = XCUIApplication()
        app.launch()
        XCTAssertTrue(app.navigationBars["课本学习"].waitForExistence(timeout: 5))

        attach(name: "01-home")

        // Achievements
        app.buttons["home-achievements"].tap()
        XCTAssertTrue(app.navigationBars["成就墙"].waitForExistence(timeout: 3))
        sleep(1)
        attach(name: "02-achievements")

        app.navigationBars.firstMatch.buttons.firstMatch.tap()
        XCTAssertTrue(app.navigationBars["课本学习"].waitForExistence(timeout: 3))

        // Review
        app.buttons["home-review"].tap()
        XCTAssertTrue(app.navigationBars["错题本"].waitForExistence(timeout: 3))
        sleep(1)
        attach(name: "03-review")

        app.navigationBars.firstMatch.buttons.firstMatch.tap()

        // Book detail (with stories/reading entries)
        let firstBook = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "一年级上册")).firstMatch
        XCTAssertTrue(firstBook.waitForExistence(timeout: 3))
        firstBook.tap()
        sleep(1)
        attach(name: "04-book-detail")
    }

    @MainActor
    private func attach(name: String) {
        let snap = XCUIScreen.main.screenshot()
        let att = XCTAttachment(screenshot: snap)
        att.name = name
        att.lifetime = .keepAlways
        add(att)
    }
}
