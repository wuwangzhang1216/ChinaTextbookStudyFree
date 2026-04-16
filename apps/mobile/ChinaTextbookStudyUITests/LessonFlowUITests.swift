import XCTest

/// End-to-end smoke test of the core learning loop using the bundled g1up seed:
///   Home → tap a downloaded book → tap a lesson → see the lesson runner CTA.
final class LessonFlowUITests: XCTestCase {
    override func setUpWithError() throws {
        continueAfterFailure = false
    }

    @MainActor
    func testHomeShowsBundledSeedBookAndOpensLesson() throws {
        try skipIfIPad()
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.navigationBars["课本学习"].waitForExistence(timeout: 5))

        let firstBook = app.buttons.containing(NSPredicate(format: "label CONTAINS %@", "一年级上册")).firstMatch
        XCTAssertTrue(firstBook.waitForExistence(timeout: 5), "first book card not found on home")
        firstBook.tap()

        // Wait for navigation away from home.
        let bookDetailNav = app.navigationBars.firstMatch
        XCTAssertTrue(bookDetailNav.waitForExistence(timeout: 5))

        // Capture an attachment of what's actually on screen so failures are debuggable.
        let snapshot = XCUIScreen.main.screenshot()
        let att = XCTAttachment(screenshot: snapshot)
        att.name = "book-detail"
        att.lifetime = .keepAlways
        add(att)

        // Tap the first known lesson row by its accessibility identifier.
        let firstLesson = app.buttons["lesson-row-g1up-u1-kp1"]
        XCTAssertTrue(firstLesson.waitForExistence(timeout: 5),
                      "lesson-row-g1up-u1-kp1 not found in book detail")
        firstLesson.tap()

        // Attach what we see post-tap (lesson runner state) before asserting.
        sleep(2)
        let runnerSnap = XCUIScreen.main.screenshot()
        let runnerAtt = XCTAttachment(screenshot: runnerSnap)
        runnerAtt.name = "lesson-runner"
        runnerAtt.lifetime = .keepAlways
        add(runnerAtt)

        let checkButton = app.buttons["检查答案"]
        XCTAssertTrue(checkButton.waitForExistence(timeout: 5),
                      "lesson runner did not render check button")

        // Audio wiring: the question's TTS speaker button + the navbar mute toggle
        // should both be present (the seed bundle ships m4a for g1up-u1-kp1).
        XCTAssertTrue(app.buttons["tts-play"].firstMatch.waitForExistence(timeout: 2),
                      "TTSButton not visible — seed audio missing or path resolution broken")
        XCTAssertTrue(app.buttons["mute-toggle"].firstMatch.waitForExistence(timeout: 2),
                      "MuteToggle not visible in lesson runner toolbar")
    }

    @MainActor
    func testHomeAchievementsAndReviewQuickLinks() throws {
        try skipIfIPad()
        let app = XCUIApplication()
        app.launch()

        XCTAssertTrue(app.navigationBars["课本学习"].waitForExistence(timeout: 5))

        // Achievements: tap quick link, expect at least one badge by id, then back.
        let achievementsLink = app.buttons["home-achievements"]
        XCTAssertTrue(achievementsLink.waitForExistence(timeout: 3))
        achievementsLink.tap()

        XCTAssertTrue(app.navigationBars["成就墙"].waitForExistence(timeout: 3))
        // first-lesson is locked at boot but its badge is rendered.
        // Anchor by the achievement's visible name to avoid XCUI tree collapse issues.
        XCTAssertTrue(app.staticTexts["出师告捷"].waitForExistence(timeout: 3),
                      "first-lesson achievement badge not rendered")

        // Back to home, then open review.
        app.navigationBars.firstMatch.buttons.firstMatch.tap()
        XCTAssertTrue(app.navigationBars["课本学习"].waitForExistence(timeout: 3))

        let reviewLink = app.buttons["home-review"]
        XCTAssertTrue(reviewLink.waitForExistence(timeout: 3))
        reviewLink.tap()
        XCTAssertTrue(app.navigationBars["错题本"].waitForExistence(timeout: 3))
    }
}
