import { notFound } from "next/navigation";
import { BenchmarkAutoRedirect } from "@/components/benchmark-auto-redirect";
import { BenchmarkProgressGlobalBar } from "@/components/benchmark-progress-global-bar";
import { Header } from "@/components/header";
import { getProject } from "@/lib/usecase/projects/get-project";
import { getProjects } from "@/lib/usecase/projects/get-projects";

export default async function ProjectsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;

  const [project, projects] = await Promise.all([
    getProject({ projectId }),
    getProjects(),
  ]);

  if (!project) notFound();

  return (
    <div className="min-h-dvh">
      <div className="fixed inset-x-0 top-0 z-50">
        <Header projects={projects} selectedProjectId={projectId} />
      </div>

      <div className="h-14" />

      <div className="sticky top-14 z-40">
        <BenchmarkAutoRedirect />
        <BenchmarkProgressGlobalBar />
      </div>

      <main className="mx-auto max-w-[1100px]">{children}</main>
    </div>
  );
}
