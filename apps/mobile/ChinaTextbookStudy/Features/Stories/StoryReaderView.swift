import SwiftUI

/// Per-book story list. Math books have no stories — graceful empty state.
struct StoryListView: View {
    let bookId: String
    @Binding var path: [AppRoute]

    @State private var stories: [Story] = []
    @State private var loadError: String?

    var body: some View {
        Group {
            if !stories.isEmpty {
                List(stories, id: \.id) { s in
                    Button {
                        path.append(.storyReader(bookId: bookId, storyId: s.id))
                    } label: {
                        VStack(alignment: .leading, spacing: 4) {
                            Text(s.title).font(.headline)
                            Text("第\(s.unitNumber)单元 · \(s.sentences.count) 句 · \(s.questions.count) 题")
                                .font(.caption).foregroundStyle(.secondary)
                        }
                    }
                }
                .listStyle(.insetGrouped)
            } else {
                VStack(spacing: 12) {
                    Image(systemName: "book.closed").font(.largeTitle).foregroundStyle(.secondary)
                    Text(loadError ?? "这本书还没有课外故事")
                        .foregroundStyle(.secondary)
                }
                .padding(40)
            }
        }
        .navigationTitle("课外故事")
        .navigationBarTitleDisplayMode(.inline)
        .task { load() }
    }

    private func load() {
        do {
            stories = (try DataLoader.shared.loadStories(bookId: bookId))?.stories ?? []
        } catch {
            loadError = (error as? LocalizedError)?.errorDescription ?? String(describing: error)
        }
    }
}

/// Sentence-by-sentence story reader with TTS, followed by static
/// comprehension questions (answer reveal on tap).
struct StoryReaderView: View {
    let bookId: String
    let storyId: String
    @State private var story: Story?
    @State private var revealed: Set<Int> = []

    var body: some View {
        Group {
            if let story {
                ScrollView {
                    VStack(alignment: .leading, spacing: 18) {
                        sentencesSection(story)
                        if !story.questions.isEmpty {
                            questionsSection(story)
                        }
                    }
                    .padding()
                }
            } else {
                ProgressView()
            }
        }
        .navigationTitle(story?.title ?? "")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { ToolbarItem(placement: .topBarTrailing) { MuteToggle() } }
        .task {
            story = (try? DataLoader.shared.loadStories(bookId: bookId))?
                .stories.first { $0.id == storyId }
        }
        .onDisappear { AudioPlayer.shared.stop() }
    }

    private func sentencesSection(_ story: Story) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            ForEach(Array(story.sentences.enumerated()), id: \.offset) { _, s in
                HStack(alignment: .top, spacing: 10) {
                    Text(s.text)
                        .font(.title3)
                        .frame(maxWidth: .infinity, alignment: .leading)
                    TTSButton(path: s.audio, size: 16)
                }
                .padding(.vertical, 4)
                Divider()
            }
        }
    }

    private func questionsSection(_ story: Story) -> some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("阅读理解").font(.headline).padding(.top, 8)
            ForEach(Array(story.questions.enumerated()), id: \.offset) { idx, q in
                questionCard(idx: idx, q: q)
            }
        }
    }

    private func questionCard(idx: Int, q: StoryQuestion) -> some View {
        let shown = revealed.contains(idx)
        return VStack(alignment: .leading, spacing: 8) {
            Text("\(idx + 1). \(q.question)")
                .font(.subheadline.bold())
            if !q.options.isEmpty {
                ForEach(Array(q.options.enumerated()), id: \.offset) { i, opt in
                    Text("\(letter(i)). \(opt)")
                        .font(.subheadline)
                        .padding(.leading, 8)
                }
            }
            Button {
                if shown { revealed.remove(idx) } else { revealed.insert(idx) }
            } label: {
                Label(shown ? "隐藏答案" : "查看答案", systemImage: shown ? "eye.slash" : "eye")
                    .font(.caption.bold())
            }
            if shown {
                Text("正确答案：\(q.answer)")
                    .font(.caption.bold())
                    .foregroundStyle(.green)
                if !q.explanation.isEmpty {
                    Text(q.explanation)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding()
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground), in: .rect(cornerRadius: 12))
    }

    private func letter(_ i: Int) -> String {
        guard let s = Unicode.Scalar(65 + i) else { return "?" }
        return String(s)
    }
}
