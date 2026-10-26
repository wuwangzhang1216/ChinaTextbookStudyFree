import XCTest

final class StoreReadinessUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    @MainActor
    private func launch(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest", "-cstf.muted", "YES", "-cstf.autoNarrate", "NO"] + extra
        app.launch()
        return app
    }

    @MainActor
    private func reveal(_ element: XCUIElement, app: XCUIApplication) {
        for _ in 0..<8 {
            if element.isHittable { return }
            app.swipeUp()
        }
        XCTAssertTrue(element.isHittable)
    }

    @MainActor
    private func settings(_ app: XCUIApplication) {
        XCTAssertTrue(app.buttons["tab-profile"].waitForExistence(timeout: 15))
        app.buttons["tab-profile"].tap()
        app.buttons["profile-settings"].tap()
        XCTAssertTrue(app.navigationBars["设置"].waitForExistence(timeout: 4))
    }

    @MainActor
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    private func solveGate(_ app: XCUIApplication) {
        let text = app.staticTexts["parental-challenge"].label
        let values = text.components(separatedBy: CharacterSet.decimalDigits.inverted).compactMap(Int.init)
        XCTAssertEqual(values.count, 3)
        guard values.count == 3 else { return }
        let field = app.textFields["parental-answer"]
        field.tap()
        field.typeText(String(values[0] * values[1] + values[2]))
        app.buttons["parental-confirm"].tap()
    }

    @MainActor
    func testPrivacyIsReadableOfflineAndOnlineLinkRequiresParent() throws {
        try skipIfIPad()
        let app = launch()
        settings(app)
        let privacy = app.buttons["privacy-policy"]
        reveal(privacy, app: app)
        privacy.tap()
        XCTAssertTrue(app.staticTexts["适用范围与原则"].waitForExistence(timeout: 4))
        XCTAssertTrue(app.buttons["privacy-close"].isHittable)
        capture("store-offline-privacy")
        let online = app.buttons["privacy-online"]
        reveal(online, app: app)
        online.tap()
        XCTAssertTrue(app.textFields["parental-answer"].waitForExistence(timeout: 4))
        app.buttons["parental-cancel"].tap()
        XCTAssertTrue(app.buttons["privacy-close"].isHittable)
        app.buttons["privacy-close"].tap()
        XCTAssertTrue(app.navigationBars["设置"].exists)
    }

    @MainActor
    func testBackupSharingNeedsCorrectParentalApprovalAndCanBeCancelled() throws {
        try skipIfIPad()
        let app = launch()
        settings(app)
        let export = app.buttons["backup-export"]
        reveal(export, app: app)
        export.tap()
        let field = app.textFields["parental-answer"]
        XCTAssertTrue(field.waitForExistence(timeout: 4))
        XCTAssertFalse(app.buttons["parental-confirm"].isEnabled)
        field.tap()
        field.typeText("1")
        app.buttons["parental-confirm"].tap()
        XCTAssertTrue(app.staticTexts["parental-error"].waitForExistence(timeout: 3))
        capture("store-parental-share-gate")
        app.buttons["parental-cancel"].tap()
        XCTAssertTrue(app.navigationBars["设置"].exists)
        export.tap()
        solveGate(app)
        let close = app.buttons.matching(NSPredicate(format: "label IN {'Close', '关闭'}")).firstMatch
        XCTAssertTrue(close.waitForExistence(timeout: 6), app.debugDescription)
        capture("store-approved-share")
        close.tap()
        XCTAssertTrue(app.navigationBars["设置"].waitForExistence(timeout: 4))
        export.tap()
        XCTAssertTrue(
            app.textFields["parental-answer"].waitForExistence(timeout: 4),
            "Approval must not become a permanent sharing bypass")
        app.buttons["parental-cancel"].tap()
    }

    @MainActor
    func testReminderPermissionIsNotRequestedBeforeParentalApproval() throws {
        try skipIfIPad()
        let app = launch(["-uitest-onboarding"])
        XCTAssertTrue(app.buttons["onboarding-continue"].waitForExistence(timeout: 15))
        app.buttons["onboarding-continue"].tap()
        let book = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'onboarding-book-'")).firstMatch
        XCTAssertTrue(book.waitForExistence(timeout: 4))
        book.tap()
        app.buttons["onboarding-continue"].tap()
        app.buttons["onboarding-continue"].tap()
        XCTAssertTrue(app.buttons["onboarding-notify-yes"].waitForExistence(timeout: 4))
        app.buttons["onboarding-notify-yes"].tap()
        XCTAssertTrue(app.textFields["parental-answer"].waitForExistence(timeout: 4))
        capture("store-reminder-parental-gate")
        app.buttons["parental-cancel"].tap()
        XCTAssertTrue(app.buttons["onboarding-notify-later"].exists)
        XCTAssertFalse(app.alerts.firstMatch.exists)
    }
    @MainActor
    func testMicrophonePermissionWaitsForParentAndCancelKeepsReaderUsable() throws {
        try skipIfIPad()
        let app = launch(["-uitest-book", "chinese-g1up"])
        guard app.buttons["home-continue"].waitForExistence(timeout: 12) else {
            throw XCTSkip("Requires the official Chinese Release fixture")
        }
        app.buttons["课文听读"].tap()
        let passage = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'passage-'")).firstMatch
        XCTAssertTrue(passage.waitForExistence(timeout: 5)); passage.tap()
        XCTAssertTrue(app.buttons["followup-start"].waitForExistence(timeout: 5))
        app.buttons["followup-start"].tap()
        XCTAssertTrue(app.textFields["parental-answer"].waitForExistence(timeout: 4))
        capture("store-microphone-parental-gate")
        app.buttons["parental-cancel"].tap()
        XCTAssertTrue(app.buttons["read-all"].isEnabled)
        XCTAssertFalse(app.alerts.firstMatch.exists)
    }

}
