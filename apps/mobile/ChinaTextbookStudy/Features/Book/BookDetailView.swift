import SwiftUI

/// One book's learning path — snake-shaped PathMap with lesson nodes,
/// claimable chest slots (every 5th lesson per unit) and side entries for
/// stories / reading.
struct BookDetailView: View {
    let bookId: String
    @ObservedObject var progressStore: ProgressStore
    @ObservedObject var downloader: AssetDownloader
    @Binding var path: [AppRoute]

    @State private var outline: Outline?
    @State private var loadError: String?
    @State private var lessons: [PathLessonMeta] = []
    /// 单元挑战槽位（outline 声明 + 本地 exam 课文件都齐才有）。
    @State private var examSlots: [ExamSlot] = []
    /// 课文听读 / 课外故事入口按数据实际存在与否条件渲染（content-8）。
    @State private var hasPassages = false
    @State private var hasStories = false
    /// A path chest the learner tapped and is currently opening.
    @State private var activeChest: ActiveChest?
    /// 0 红心预拦截（ioslesson-2）：和首页路径一样，没心先弹红心详情。
    @State private var showZeroHeartsSheet = false

    private struct ActiveChest: Identifiable { let id: String }

    var body: some View {
        Group {
            if let outline {
                content(outline: outline)
            } else if let loadError {
                VStack(spacing: 12) {
                    Image(systemName: "tray.and.arrow.down").font(.largeTitle).foregroundStyle(.secondary)
                    Text("这本书还没下载").font(.headline)
                    Text(loadError).font(.footnote).foregroundStyle(.secondary)
                    if let entry = downloader.manifest?.books.first(where: { $0.bookId == bookId }) {
                        BookDownloadCard(entry: entry, downloader: downloader) { load() }
                            .padding(.horizontal, 24)
                    }
                }
                .padding()
            } else {
                ProgressView()
            }
        }
        .navigationTitle(outline?.textbook ?? bookId)
        .navigationBarTitleDisplayMode(.inline)
        .task { load() }
    }

    private func content(outline: Outline) -> some View {
        ZStack(alignment: .top) {
            DuoColors.darkBg.ignoresSafeArea()

            VStack(spacing: 0) {
                // Side entries (stories/reading) at top — dark themed.
                // Only shown for books that actually ship the content, so a
                // math book no longer advertises empty 课文/故事 lists.
                if hasPassages || hasStories {
                    HStack(spacing: 12) {
                        if hasPassages {
                            sideEntry(label: "课文听读", icon: "text.book.closed.fill", tint: DuoColors.secondary) {
                                path.append(.reading(bookId: bookId))
                            }
                        }
                        if hasStories {
                            sideEntry(label: "课外故事", icon: "book.closed.fill", tint: DuoColors.beetle) {
                                path.append(.stories(bookId: bookId))
                            }
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 8)
                    .padding(.bottom, 4)
                }

                // Snake-shaped PathMap
                PathMapView(
                    lessons: buildPathNodes(),
                    onTap: { node in
                        if node.kind == .chest {
                            activeChest = ActiveChest(id: node.id)
                        } else {
                            // 0 红心预拦截（ioslesson-2）：先结算回复计时器再看余量，
                            // 没红心就弹红心详情（倒计时 + 宝石补满），不进课 ——
                            // 与首页路径入口完全一致。
                            guard hasHeartToSpend() else { return }
                            path.append(.lesson(bookId: bookId, lessonId: node.id))
                        }
                    },
                    onGuideTap: { unitNumber in
                        path.append(.guide(bookId: bookId, unitNumber: unitNumber))
                    },
                    onJumpTap: { unitNumber in
                        // 跳级失败要扣 1 心 —— 0 心时先弹补心，别让孩子白考，
                        // 更别让点击「什么都没发生」。
                        guard hasHeartToSpend() else { return }
                        path.append(.jumpTest(bookId: bookId, unitNumber: unitNumber))
                    }
                )
            }
        }
        // Chest open modal — full-screen cover so the back button / tab bar
        // can't be tapped mid-claim; rolls the reward, then banks + marks it.
        .fullScreenCover(item: $activeChest) { chest in
            ChestModalView(
                onClaim: { gems in
                    progressStore.addGems(gems)
                    progressStore.claimChest(chest.id)
                },
                onDismiss: { activeChest = nil }
            )
            .presentationBackground(.clear)
        }
        // 0 心预拦截：先看倒计时/补心，别把孩子放进一节答不了错的课。
        .sheet(isPresented: $showZeroHeartsSheet) {
            HeartDetailSheet(progressStore: progressStore)
                .presentationDetents([.medium, .large])
                .presentationDragIndicator(.visible)
        }
    }

    /// 结算红心恢复计时器后判断还能不能开一局。没心时给触感 + 弹红心详情，
    /// 返回 false 让调用方停下 —— 静默 return 会让点击像坏掉了一样。
    private func hasHeartToSpend() -> Bool {
        progressStore.tickHeartRecharge()
        guard progressStore.hearts > 0 else {
            HapticEngine.shared.wrong()
            showZeroHeartsSheet = true
            return false
        }
        return true
    }

    private func sideEntry(label: String, icon: String, tint: Color, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 10) {
                Image(systemName: icon)
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(tint)
                Text(label)
                    .duoFont(.caption)
                    .foregroundStyle(DuoColors.darkInk)
            }
            .frame(maxWidth: .infinity, minHeight: 48)
            .background(DuoColors.darkSurface, in: .rect(cornerRadius: 14))
            .overlay {
                RoundedRectangle(cornerRadius: 14)
                    .strokeBorder(DuoColors.darkSurfaceAlt, lineWidth: 2)
            }
        }
        .buttonStyle(.plain)
    }

    /// Lesson + chest nodes for the path (shared builder with the Home tab).
    private func buildPathNodes() -> [PathMapNode] {
        PathNodeBuilder.nodes(
            bookId: bookId,
            lessons: lessons,
            progressStore: progressStore,
            examSlots: examSlots
        )
    }

    // MARK: - Loading

    private func load() {
        do {
            let outline = try DataLoader.shared.loadOutline(bookId: bookId)
            self.outline = outline
            // Peek at each lesson file for its question count, degrading to 0.
            self.lessons = outline.pathLessonMetas(bookId: bookId) { lessonId in
                (try? DataLoader.shared.loadLesson(bookId: bookId, lessonId: lessonId).questions.count) ?? 0
            }
            self.examSlots = outline.examSlots(bookId: bookId)
            // Ground truth after download is the file itself (hasPassages /
            // hasStories flags in the site index can lag behind the data zip).
            self.hasPassages = (((try? DataLoader.shared.loadPassages(bookId: bookId)) ?? nil)?.passages.isEmpty == false)
            self.hasStories = (((try? DataLoader.shared.loadStories(bookId: bookId)) ?? nil)?.stories.isEmpty == false)
            self.loadError = nil
        } catch {
            self.loadError = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
        }
    }

}
