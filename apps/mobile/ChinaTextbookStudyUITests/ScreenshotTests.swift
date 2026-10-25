import XCTest

/// Walks the main surfaces and attaches a screenshot of each, so the rendered
/// state can be reviewed from the test report without driving the simulator by
/// hand. Assertions are deliberately light — this is a capture harness.
final class ScreenshotTests: XCTestCase {
    @MainActor
    func testCaptureMainScreens() throws {
        try skipIfIPad()
        let app = XCUIApplication()
        app.launchArguments.append("-uitest")
        app.launch()

        XCTAssertTrue(app.buttons["lesson-row-g1up-u1-kp1"].waitForExistence(timeout: 15),
                      "path home did not render")
        attach(name: "01-home-path")

        // Start popup over the path.
        app.buttons["lesson-row-g1up-u1-kp1"].firstMatch.tap()
        XCTAssertTrue(app.buttons["lesson-start"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["lesson-start"].isHittable, "The start card must be visible without an extra scroll")
        XCTAssertLessThanOrEqual(app.buttons["lesson-start"].frame.maxY, app.buttons["tab-learn"].frame.minY,
                                 "The complete primary action must stay above the tab bar")
        attach(name: "02-start-popup")

        // 课前知识讲解（Wave E2）——顺手截一张，再翻到题目。
        app.buttons["lesson-start"].tap()
        if app.buttons["intro-next"].waitForExistence(timeout: 3) || app.buttons["intro-start"].exists {
            attach(name: "02b-knowledge-intro")
        }
        skipLessonIntroIfPresent(app)

        // Lesson runner + feedback panel.
        XCTAssertTrue(app.buttons["检查答案"].waitForExistence(timeout: 8))
        attach(name: "03-lesson-question")

        app.buttons["tf-对"].firstMatch.tap()
        app.buttons["检查答案"].firstMatch.tap()
        XCTAssertTrue(app.buttons["继续"].firstMatch.waitForExistence(timeout: 5))
        attach(name: "04-lesson-feedback")

        // Leave the lesson via the custom quit overlay (ghost 「退出」).
        app.buttons["关闭"].firstMatch.tap()
        XCTAssertTrue(app.buttons["lesson-quit"].firstMatch.waitForExistence(timeout: 3))
        app.buttons["lesson-quit"].firstMatch.tap()
        XCTAssertTrue(app.buttons["tab-review"].waitForExistence(timeout: 8))

        // Secondary tabs.
        app.buttons["tab-review"].tap()
        XCTAssertTrue(app.navigationBars["错题本"].waitForExistence(timeout: 4))
        attach(name: "05-review")

        app.buttons["tab-shop"].tap()
        XCTAssertTrue(app.navigationBars["商店"].waitForExistence(timeout: 4))
        attach(name: "06-shop")

        app.buttons["tab-profile"].tap()
        XCTAssertTrue(app.navigationBars["我的"].waitForExistence(timeout: 4))
        attach(name: "07-profile")
    }

    @MainActor
    private func attach(name: String) {
        let att = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        att.name = name
        att.lifetime = .keepAlways
        add(att)
    }
}
