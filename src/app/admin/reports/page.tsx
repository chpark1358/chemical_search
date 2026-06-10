import { AppHeader } from "@/components/common/AppHeader";

const reports = [
  { id: "R-1001", target: "퇴근길 길거리 음식 월드컵", reason: "저작권/초상권", status: "대기" },
  { id: "R-1002", target: "주말에 가고 싶은 장소 월드컵", reason: "기타", status: "검토 중" }
];

export default function AdminReportsPage() {
  return (
    <main className="page-shell">
      <AppHeader />
      <section className="container py-8">
        <h1 className="text-3xl font-black">신고 큐</h1>
        <div className="mt-6 overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)]">
          {reports.map((report) => (
            <div
              key={report.id}
              className="grid gap-2 border-b border-[var(--line)] p-4 last:border-b-0 md:grid-cols-[120px_1fr_160px_120px]"
            >
              <strong>{report.id}</strong>
              <span>{report.target}</span>
              <span>{report.reason}</span>
              <span className="font-bold text-[var(--accent)]">{report.status}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
