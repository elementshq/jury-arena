"use client";

import { ChevronDown, Pencil, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";
import type { ProjectModel } from "@/lib/db/repository/project-repository";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

interface ProjectDropdownProps {
  projects: ProjectModel[];
  selectedProjectId: string;
}

/**
 * NOTE:
 * - Cookie(HTTPOnly)更新は API 経由で行う
 */
export function ProjectDropdown({
  projects,
  selectedProjectId,
}: ProjectDropdownProps) {
  const router = useRouter();

  const selected = useMemo(
    () => projects.find((p) => p.id === selectedProjectId) ?? projects[0],
    [projects, selectedProjectId],
  );

  const [busy, setBusy] = useState(false);

  // Dropdown open (controlled)
  const [menuOpen, setMenuOpen] = useState(false);

  // Add dialog
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");

  // Rename dialog
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [renameTarget, setRenameTarget] = useState<ProjectModel | null>(null);
  const [renameValue, setRenameValue] = useState("");

  async function setSelectedProjectId(projectId: string) {
    const res = await fetch("/api/projects/selected", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ projectId }),
    });
    if (!res.ok) throw new Error("failed to set selected project");
  }

  async function onSelectProject(projectId: string) {
    if (busy) return;
    setBusy(true);
    try {
      await setSelectedProjectId(projectId);
      router.push(`/projects/${projectId}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  function openRenameDialog(project: ProjectModel, e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();

    // Close dropdown to avoid Radix focus/overlay issues on refresh
    setMenuOpen(false);

    setRenameTarget(project);
    setRenameValue(project.name);
    setShowRenameDialog(true);
  }

  async function handleAddProject() {
    if (busy) return;

    const name = newProjectName.trim();
    if (!name) return;

    setBusy(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("failed to create project");

      const json = (await res.json()) as { project: ProjectModel };
      const created = json.project;

      // 作成したProjectを選択状態にして遷移
      await setSelectedProjectId(created.id);

      // Close UI first (important)
      setShowAddDialog(false);
      setNewProjectName("");

      router.push(`/projects/${created.id}`);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleRenameProject() {
    if (busy) return;
    const target = renameTarget;
    if (!target) return;

    const name = renameValue.trim();
    if (!name) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${target.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error("failed to rename project");

      // Close UI first (important)
      setShowRenameDialog(false);
      setRenameTarget(null);

      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteProject(projectId: string, e?: React.MouseEvent) {
    e?.preventDefault();
    e?.stopPropagation();
    if (busy) return;

    setMenuOpen(false);

    const ok = window.confirm("このプロジェクトを削除しますか？");
    if (!ok) return;

    setBusy(true);
    try {
      const res = await fetch(`/api/projects/${projectId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("failed to delete project");

      const isDeletingSelected = projectId === selectedProjectId;

      // 次に選ぶ project を決める（削除対象以外の先頭）
      const next = projects.find((p) => p.id !== projectId) ?? null;

      if (isDeletingSelected) {
        if (next) {
          // 先に cookie を更新して SSR リダイレクトを防ぐ
          await setSelectedProjectId(next.id);

          startTransition(() => {
            router.replace(`/projects/${next.id}`);
          });
        } else {
          // project が 0 件になるケース
          // 選択 cookie を「空」にできる API があるなら叩くのが理想
          // ない場合は /projects へ
          startTransition(() => {
            router.replace("/projects");
          });
        }
        return;
      }

      // 選択中以外を消した場合：ページ遷移は不要、一覧だけ更新
      // （ここで replace("/projects") すると逆に遷移でちらつく）
      startTransition(() => {
        router.refresh();
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            disabled={busy}
            type="button"
            aria-label={selected ? `Project: ${selected.name}` : "Project menu"}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem
            onSelect={() => {
              setMenuOpen(false);
              setShowAddDialog(true);
            }}
            disabled={busy}
          >
            <Plus className="mr-2 h-4 w-4" />
            プロジェクトを追加
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <div className="text-xs text-slate-500 px-2 py-1.5">
            Projects
          </div>

          {projects.map((project) => (
            <DropdownMenuItem
              key={project.id}
              onSelect={() => {
                setMenuOpen(false);
                onSelectProject(project.id);
              }}
              className="flex items-center justify-between group"
              disabled={busy}
            >
              <span
                className={
                  project.id === selectedProjectId ? "font-medium" : ""
                }
              >
                {project.name}
              </span>

              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0"
                  onClick={(e) => openRenameDialog(project, e)}
                  disabled={busy}
                  aria-label="Rename"
                >
                  <Pencil className="h-3 w-3" />
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 w-6 p-0 text-red-600 hover:text-red-700"
                  onClick={(e) => handleDeleteProject(project.id, e)}
                  disabled={busy}
                  aria-label="Delete"
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Add Project Dialog */}
      <Dialog
        open={showAddDialog}
        onOpenChange={(open) => {
          setShowAddDialog(open);
          if (!open) setNewProjectName("");
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新しいプロジェクトを作成</DialogTitle>
            <DialogDescription>
              プロジェクト名を入力してください。
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <Label htmlFor="project-name">プロジェクト名</Label>
            <Input
              id="project-name"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              placeholder="My Project"
              onKeyDown={(e) => e.key === "Enter" && handleAddProject()}
              disabled={busy}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowAddDialog(false)}
              disabled={busy}
              type="button"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleAddProject}
              disabled={busy || !newProjectName.trim()}
              type="button"
            >
              作成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Project Dialog */}
      <Dialog
        open={showRenameDialog}
        onOpenChange={(open) => {
          setShowRenameDialog(open);
          if (!open) {
            setRenameTarget(null);
            setRenameValue("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>プロジェクト名を変更</DialogTitle>
            <DialogDescription>
              新しいプロジェクト名を入力してください。
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-3">
            <Label htmlFor="rename-project">プロジェクト名</Label>
            <Input
              id="rename-project"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleRenameProject()}
              disabled={busy}
            />
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRenameDialog(false)}
              disabled={busy}
              type="button"
            >
              キャンセル
            </Button>
            <Button
              onClick={handleRenameProject}
              disabled={busy || !renameValue.trim()}
              type="button"
            >
              変更
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}