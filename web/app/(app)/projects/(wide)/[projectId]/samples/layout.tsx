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
    <div className="min-h-dvh flex flex-col">
      <Header projects={projects} selectedProjectId={projectId} />
      <BenchmarkAutoRedirect />
      <BenchmarkProgressGlobalBar />
      <main className="flex-1 min-h-0 flex overflow-hidden">{children}</main>
    </div>
  );
}
