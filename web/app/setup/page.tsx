import { redirect } from "next/navigation";
import { getSetupIssues } from "@/lib/setup/requirements";

export default function SetupPage() {
  const issues = getSetupIssues();

  if (issues.length === 0) {
    redirect("/");
  }

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        backgroundColor: "#f9fafb",
        padding: 24,
      }}
    >
      <div style={{ maxWidth: 560, width: "100%" }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>
          Setup required
        </h1>
        <p style={{ color: "#6b7280", marginBottom: 20 }}>
          Fix the following items and restart the dev server.
        </p>

        <div style={{ display: "grid", gap: 12 }}>
          {issues.map((i) => (
            <section
              key={i.id}
              style={{
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                padding: 16,
                backgroundColor: "#fff",
              }}
            >
              <div style={{ fontWeight: 600 }}>{i.title}</div>
              <div style={{ color: "#6b7280", marginTop: 4, fontSize: 14 }}>
                {i.detail}
              </div>
              <pre
                style={{
                  marginTop: 10,
                  padding: 12,
                  backgroundColor: "#111827",
                  color: "#e5e7eb",
                  borderRadius: 8,
                  fontSize: 13,
                  overflowX: "auto",
                }}
              >
                {i.fix}
              </pre>
            </section>
          ))}
        </div>
      </div>
    </main>
  );
}
