import SwiftUI

/// Grade selection grid — port of /grade route.
/// 6 grade tiles (1-6); tapping one stores the selection and pops back home.
struct GradePickerView: View {
    @ObservedObject var progressStore: ProgressStore
    @Binding var path: [AppRoute]

    private let grades = Array(1...6)
    @ScaledMetric(relativeTo: .largeTitle) private var numeralSize: CGFloat = 56

    var body: some View {
        ScrollView {
            LazyVGrid(columns: [GridItem(.adaptive(minimum: 140), spacing: 16)], spacing: 16) {
                ForEach(grades, id: \.self) { grade in
                    Button {
                        progressStore.setSelectedGrade(grade)
                        path.removeAll() // back to home
                    } label: {
                        gradeTile(grade: grade)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(20)
        }
        .navigationTitle("选择年级")
        .navigationBarTitleDisplayMode(.inline)
    }

    private func gradeTile(grade: Int) -> some View {
        let isCurrent = progressStore.selectedGrade == grade
        return VStack(spacing: 8) {
            Text("\(grade)")
                .font(.system(size: numeralSize, weight: .heavy, design: .rounded))
                .foregroundStyle(isCurrent ? Color.white : Color.accentColor)
                .accessibilityHidden(true)
            Text("年级")
                .font(.headline)
                .foregroundStyle(isCurrent ? Color.white : .primary)
        }
        .frame(maxWidth: .infinity, minHeight: 140)
        .background(
            isCurrent ? Color.accentColor : Color(.secondarySystemBackground),
            in: .rect(cornerRadius: 22)
        )
        .accessibilityElement(children: .combine)
        .accessibilityLabel("\(grade) 年级")
        .accessibilityAddTraits(isCurrent ? [.isSelected, .isButton] : [.isButton])
    }
}
