import XCTest

/// Captures actual, unmodified native screens at each destination's full resolution.
final class StoreListingScreenshotTests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    @MainActor
    func testCaptureListingScreens() throws {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest", "-uitest-book", "g1up-2026", "-cstf.muted", "YES", "-cstf.autoNarrate", "NO"]
        app.launch()
        XCTAssertTrue(app.buttons["home-continue"].waitForExistence(timeout: 15))
        capture("listing-01-learning")
        app.buttons["home-continue"].tap()
        skipLessonIntroIfPresent(app)
        XCTAssertTrue(app.buttons["检查答案"].waitForExistence(timeout: 8))
        capture("listing-02-question")
        app.buttons["关闭"].firstMatch.tap()
        if app.buttons["lesson-quit"].waitForExistence(timeout: 1) { app.buttons["lesson-quit"].tap() }
        let shop = UIDevice.current.userInterfaceIdiom == .pad ? app.staticTexts["sidebar-shop"] : app.buttons["tab-shop"]
        XCTAssertTrue(shop.waitForExistence(timeout: 5)); shop.tap()
        XCTAssertTrue(app.navigationBars["商店"].waitForExistence(timeout: 4))
        capture("listing-03-shop")
        let profile = UIDevice.current.userInterfaceIdiom == .pad ? app.staticTexts["sidebar-profile"] : app.buttons["tab-profile"]
        profile.tap()
        XCTAssertTrue(app.buttons["profile-settings"].waitForExistence(timeout: 4))
        capture("listing-04-profile")
    }

    @MainActor
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }
}
