import XCTest

@testable import ChinaTextbookStudy

final class ParentalApprovalTests: XCTestCase {
    func testChallengeRejectsWrongAndNonNumericAnswers() {
        let challenge = ParentalChallenge(first: 47, second: 23, extra: 19)
        XCTAssertTrue(challenge.accepts("1100"))
        XCTAssertTrue(challenge.accepts(" 1100\n"))
        for input in ["", "yes", "1101", "1100.0", "47×23+19"] {
            XCTAssertFalse(challenge.accepts(input))
        }
    }

    func testOutboundFileStaysInsideItsOwnTemporaryDirectory() throws {
        let data = Data("test backup".utf8)
        let url = try ParentalShareFile.write(data, filename: "../backup.json")
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        XCTAssertEqual(url.lastPathComponent, "backup.json")
        XCTAssertTrue(url.deletingLastPathComponent().lastPathComponent.hasPrefix("congcong-share-"))
        XCTAssertEqual(try Data(contentsOf: url), data)
    }

    func testPrivacyPolicyShipsAsReadableOfflineContent() throws {
        let policy = try AppPrivacyPolicy.bundled()
        XCTAssertFalse(policy.title.isEmpty)
        XCTAssertFalse(policy.sections.isEmpty)
        XCTAssertTrue(policy.sections.allSatisfy { !$0.title.isEmpty && !$0.text.isEmpty })
        XCTAssertEqual(policy.website.scheme, "https")
        XCTAssertEqual(policy.support.scheme, "https")
    }
}
