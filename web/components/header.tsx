"use client";

import Image from "next/image";
import Link from "next/link";
import { ProjectDropdown } from "@/components/project-dropdown";
import type { ProjectModel } from "@/lib/db/repository/project-repository";

export function Header({
  projects,
  selectedProjectId,
}: {
  projects: ProjectModel[];
  selectedProjectId: string;
}) {
  return (
    <header className="bg-[#F5F6F8]">
      <div className="px-6 h-14 flex items-center gap-1">
        <Image src="/logo.png" alt="JuryArena" height={24} width={24} className="h-6 w-auto" />
        <Link href="/">
          <span className="text-slate-900 whitespace-nowrap">JuryArena</span>
        </Link>

        <ProjectDropdown
          projects={projects}
          selectedProjectId={selectedProjectId}
        />
      </div>
    </header>
  );
}
