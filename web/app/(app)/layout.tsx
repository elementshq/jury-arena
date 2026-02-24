import { redirect } from "next/navigation";
import { getSetupIssues } from "@/lib/setup/requirements";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const issues = getSetupIssues();
  if (issues.length > 0) {
    redirect("/setup");
  }
  return children;
}
