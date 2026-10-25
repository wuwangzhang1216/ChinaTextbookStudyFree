import XCTest

/// Exercise user-visible decisions and their outcomes, including the new
/// direct lesson entry and onboarding's grade/book consistency rule.
final class LearningExperienceUITests: XCTestCase {
    override func setUpWithError() throws { continueAfterFailure = false }

    @MainActor
    private func launch(_ extra: [String] = []) -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments = ["-uitest"] + extra
        app.launch()
        return app
    }

    @MainActor
    private func capture(_ name: String) {
        let attachment = XCTAttachment(screenshot: XCUIScreen.main.screenshot())
        attachment.name = name
        attachment.lifetime = .keepAlways
        add(attachment)
    }

    @MainActor
    func testHomeContinueStartsTheCurrentLesson() throws {
        try skipIfIPad()
        let app = launch()
        let start = app.buttons["home-continue"]
        XCTAssertTrue(start.waitForExistence(timeout: 15))
        XCTAssertTrue(start.isHittable)
        capture("upgrade-home")
        start.tap()
        skipLessonIntroIfPresent(app)
        XCTAssertTrue(app.buttons["检查答案"].waitForExistence(timeout: 8))
        capture("upgrade-question")
        app.buttons["tf-对"].firstMatch.tap()
        app.buttons["检查答案"].tap()
        XCTAssertTrue(app.buttons["继续"].firstMatch.waitForExistence(timeout: 4))
        XCTAssertTrue(app.buttons["继续"].firstMatch.isHittable)
        capture("upgrade-feedback")
    }

    @MainActor
    func testChangingGradeRequiresChoosingAMatchingBook() throws {
        let app = launch(["-uitest-onboarding"])
        let next = app.buttons["onboarding-continue"]
        XCTAssertTrue(next.waitForExistence(timeout: 15))
        capture("upgrade-onboarding-welcome")
        next.tap()
        XCTAssertFalse(next.isEnabled)
        let books = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'onboarding-book-'"))
        XCTAssertTrue(books.firstMatch.waitForExistence(timeout: 4))
        books.firstMatch.tap()
        XCTAssertTrue(next.isEnabled)
        app.buttons["2 年级"].tap()
        XCTAssertFalse(next.isEnabled, "A book from grade one must not remain selected after changing grade")
        books.firstMatch.tap()
        XCTAssertTrue(next.isEnabled)
        capture("upgrade-onboarding-books")
        next.tap()
        XCTAssertTrue(app.staticTexts["每天，进步一点点"].waitForExistence(timeout: 4))
        capture("upgrade-onboarding-goal")
        next.tap()
        XCTAssertTrue(app.buttons["onboarding-notify-later"].waitForExistence(timeout: 4))
        capture("upgrade-onboarding-reminder")
    }

    @MainActor
    func testEmptyReviewOffersAWayBackToLearning() throws {
        try skipIfIPad()
        let app = launch()
        XCTAssertTrue(app.buttons["tab-review"].waitForExistence(timeout: 15))
        app.buttons["tab-review"].tap()
        let resume = app.buttons["review-continue-learning"]
        XCTAssertTrue(resume.waitForExistence(timeout: 4))
        capture("upgrade-review")
        resume.tap()
        XCTAssertTrue(app.buttons["lesson-row-g1up-u1-kp1"].waitForExistence(timeout: 6))
    }

    @MainActor
    func testShopPreviewAndProfileRemainReachable() throws {
        try skipIfIPad()
        let app = launch()
        XCTAssertTrue(app.buttons["tab-shop"].waitForExistence(timeout: 15))
        app.buttons["tab-shop"].tap()
        capture("upgrade-shop")
        app.buttons["tab-profile"].tap()
        let settings = app.buttons["profile-settings"]
        XCTAssertTrue(settings.waitForExistence(timeout: 4))
        capture("upgrade-profile")
        settings.tap()
        XCTAssertTrue(app.navigationBars["设置"].waitForExistence(timeout: 4))
    }

    @MainActor
    func testLargeTypeKeepsLessonActionsReachable() throws {
        try skipIfIPad()
        let app = launch(["-UIPreferredContentSizeCategoryName", "UICTContentSizeCategoryAccessibilityM"])
        let start = app.buttons["home-continue"]
        XCTAssertTrue(start.waitForExistence(timeout: 15))
        if !start.isHittable { app.swipeUp() }
        XCTAssertTrue(start.isHittable)
        capture("upgrade-large-type-home")
        start.tap()
        skipLessonIntroIfPresent(app)
        let check = app.buttons["检查答案"]
        XCTAssertTrue(check.waitForExistence(timeout: 8))
        let yes = app.buttons["tf-对"].firstMatch
        if !yes.isHittable { app.swipeUp() }
        XCTAssertTrue(yes.isHittable)
        yes.tap()
        XCTAssertTrue(check.isHittable)
        check.tap()
        let next = app.buttons["继续"].firstMatch
        XCTAssertTrue(next.waitForExistence(timeout: 4))
        XCTAssertTrue(next.isHittable)
        capture("upgrade-large-type-feedback")
    }

    /// Optional integration checks use the actual v1.7.0 iOS Release bundles
    /// installed in the simulator. The portable seed-only suite skips them.
    @MainActor
    func testInstalledChineseReleaseReadingJourney() throws {
        try skipIfIPad()
        let app = launch(["-uitest-book", "chinese-g1up"])
        guard app.buttons["home-continue"].waitForExistence(timeout: 12) else {
            throw XCTSkip("Install the official chinese-g1up iOS Release bundles to run this integration check")
        }
        app.buttons["课文听读"].tap()
        let passages = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'passage-'"))
        XCTAssertTrue(passages.firstMatch.waitForExistence(timeout: 5))
        capture("upgrade-passage-library")
        passages.firstMatch.tap()
        XCTAssertTrue(app.buttons["read-all"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["read-all"].isEnabled, "The installed AAC audio must resolve")
        capture("upgrade-passage-reader")
        app.navigationBars.buttons.firstMatch.tap()
        app.navigationBars.buttons.firstMatch.tap()
        app.buttons["课外故事"].tap()
        let stories = app.buttons.matching(NSPredicate(format: "identifier BEGINSWITH 'story-'"))
        XCTAssertTrue(stories.firstMatch.waitForExistence(timeout: 5))
        capture("upgrade-story-library")
        stories.firstMatch.tap()
        XCTAssertTrue(app.buttons["story-quiz-start"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["story-quiz-start"].isHittable)
        capture("upgrade-story-reader")
        app.buttons["story-quiz-start"].tap()
        XCTAssertTrue(app.staticTexts["阅读理解"].waitForExistence(timeout: 5))
    }

    @MainActor
    func testInstalledRevisedMathReleaseOpensCurrentLesson() throws {
        try skipIfIPad()
        let app = launch(["-uitest-book", "g1up-2026"])
        let start = app.buttons["home-continue"]
        guard start.waitForExistence(timeout: 12) else {
            throw XCTSkip("Install the official g1up-2026 iOS Release bundles to run this integration check")
        }
        capture("upgrade-revised-math")
        start.tap()
        skipLessonIntroIfPresent(app)
        XCTAssertTrue(app.buttons["检查答案"].waitForExistence(timeout: 8))
        capture("upgrade-revised-math-question")
    }

    @MainActor
    func testWrongAnswerFlowsIntoScheduledReview() throws {
        try skipIfIPad()
        let app = launch()
        XCTAssertTrue(app.buttons["home-continue"].waitForExistence(timeout: 15))
        app.buttons["home-continue"].tap()
        skipLessonIntroIfPresent(app)
        app.buttons["tf-错"].firstMatch.tap()
        app.buttons["检查答案"].tap()
        XCTAssertTrue(app.buttons["知道了"].waitForExistence(timeout: 5))
        capture("upgrade-wrong-answer")
        app.buttons["关闭"].firstMatch.tap()
        app.buttons["lesson-quit"].tap()
        app.buttons["tab-review"].tap()
        XCTAssertTrue(app.buttons["review-start"].waitForExistence(timeout: 5))
        capture("upgrade-review-due")
        app.buttons["review-bucket-明天"].tap()
        XCTAssertTrue(app.staticTexts["明天 · 0 道题"].waitForExistence(timeout: 3))
        app.buttons["review-bucket-今天"].tap()
        XCTAssertTrue(app.staticTexts["今天 · 1 道题"].waitForExistence(timeout: 3))
    }

    @MainActor
    func testCompletedLessonCanReturnToTheNextStepWithoutLosingProgress() throws {
        try skipIfIPad()
        let app = launch()
        XCTAssertTrue(app.buttons["home-continue"].waitForExistence(timeout: 15))
        app.buttons["home-continue"].tap()
        skipLessonIntroIfPresent(app)
        // The checked-in legacy seed is deliberately stable for this flow.
        for answer in ["对", "对", "5个", "5", "9", "1块", "8", "6人", "3", "4", "7", "4"] {
            XCTAssertTrue(app.buttons["检查答案"].waitForExistence(timeout: 5))
            if answer == "对" {
                app.buttons["tf-对"].firstMatch.tap()
            } else if app.textFields.firstMatch.exists {
                app.textFields.firstMatch.tap()
                app.textFields.firstMatch.typeText(answer)
            } else {
                app.buttons[answer].firstMatch.tap()
            }
            app.buttons["检查答案"].tap()
            let next = app.buttons["继续"].firstMatch
            XCTAssertTrue(next.waitForExistence(timeout: 5))
            next.tap()
        }
        let back = app.buttons["result-back-to-path"]
        XCTAssertTrue(back.waitForExistence(timeout: 8))
        capture("upgrade-lesson-result")
        back.tap()
        let completed = app.buttons["lesson-row-g1up-u1-kp1"]
        XCTAssertTrue(completed.waitForExistence(timeout: 6))
        XCTAssertTrue(completed.label.contains("已完成"))
        XCTAssertTrue(app.buttons["lesson-row-g1up-u1-kp2"].label.contains("当前"))
    }
}
