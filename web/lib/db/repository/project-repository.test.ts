import { describe, expect, it } from "vitest";
import { projects } from "@/lib/db/schema";
import { withTestTx } from "@/test/helpers/db";
import { OrderDirection } from "../query-options";
import { ProjectCreateSchema, ProjectRepository } from "./project-repository";

describe("ProjectRepository", () => {
  it("save -> find", async () => {
    await withTestTx(async (tx) => {
      const repo = new ProjectRepository(tx);

      const saved = await repo.save(ProjectCreateSchema.parse({ name: "p1" }));
      const found = await repo.find({ id: saved.id });

      expect(found?.id).toBe(saved.id);
      expect(found?.name).toBe("p1");
      expect(found?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll inserts multiple rows", async () => {
    await withTestTx(async (tx) => {
      const repo = new ProjectRepository(tx);

      const saved = await repo.saveAll(
        [{ name: "a" }, { name: "b" }].map((x) => ProjectCreateSchema.parse(x)),
      );

      expect(saved).toHaveLength(2);
      expect(saved.map((r) => r.name).sort()).toEqual(["a", "b"]);
      expect(saved[0]?.createdAt).toBeInstanceOf(Date);
      expect(saved[1]?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll returns [] for empty inputs", async () => {
    await withTestTx(async (tx) => {
      const repo = new ProjectRepository(tx);

      const saved = await repo.saveAll([]);
      expect(saved).toEqual([]);
    });
  });

  it("update updates name", async () => {
    await withTestTx(async (tx) => {
      const repo = new ProjectRepository(tx);

      const saved = await repo.save(
        ProjectCreateSchema.parse({ name: "before" }),
      );
      const updated = await repo.update({ id: saved.id, name: "after" });

      expect(updated.id).toBe(saved.id);
      expect(updated.name).toBe("after");

      const found = await repo.find({ id: saved.id });
      expect(found?.name).toBe("after");
    });
  });

  it("update throws when no fields to update", async () => {
    await withTestTx(async (tx) => {
      const repo = new ProjectRepository(tx);

      const saved = await repo.save(ProjectCreateSchema.parse({ name: "p" }));

      await expect(repo.update({ id: saved.id })).rejects.toThrow(
        "no fields to update",
      );
    });
  });

  it("update throws when project not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new ProjectRepository(tx);

      await expect(
        repo.update({
          id: "00000000-0000-0000-0000-000000000000",
          name: "x",
        }),
      ).rejects.toThrow("project not found");
    });
  });

  it("find returns null when not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new ProjectRepository(tx);

      const found = await repo.find({
        id: "00000000-0000-0000-0000-000000000000",
      });

      expect(found).toBeNull();
    });
  });

  it("filter supports where", async () => {
    await withTestTx(async (tx) => {
      const repo = new ProjectRepository(tx);

      const p1 = await repo.save(ProjectCreateSchema.parse({ name: "alpha" }));
      await repo.save(ProjectCreateSchema.parse({ name: "beta" }));

      const rows = await repo.filter({ where: { id: p1.id } });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(p1.id);
      expect(rows[0]?.name).toBe("alpha");
    });
  });

  it("filter supports orderBy asc/desc", async () => {
    await withTestTx(async (tx) => {
      const repo = new ProjectRepository(tx);

      await repo.saveAll(
        [{ name: "c" }, { name: "a" }, { name: "b" }].map((x) =>
          ProjectCreateSchema.parse(x),
        ),
      );

      const ascRows = await repo.filter({
        orderBy: { key: projects.name, direction: OrderDirection.Asc },
      });
      expect(ascRows.slice(0, 3).map((r) => r.name)).toEqual(["a", "b", "c"]);

      const descRows = await repo.filter({
        orderBy: { key: projects.name, direction: OrderDirection.Desc },
      });
      expect(descRows.slice(0, 3).map((r) => r.name)).toEqual(["c", "b", "a"]);
    });
  });

  it("filter supports limit/offset", async () => {
    await withTestTx(async (tx) => {
      const repo = new ProjectRepository(tx);

      await repo.saveAll(
        [{ name: "a" }, { name: "b" }, { name: "c" }].map((x) =>
          ProjectCreateSchema.parse(x),
        ),
      );

      const rows = await repo.filter({
        orderBy: { key: projects.name, direction: OrderDirection.Asc },
        limit: 2,
        offset: 1,
      });

      expect(rows.map((r) => r.name)).toEqual(["b", "c"]);
    });
  });

  it("filter throws on invalid where column", async () => {
    await withTestTx(async (tx) => {
      const repo = new ProjectRepository(tx);

      await expect(
        repo.filter({ where: { nope: "x" } as any }),
      ).rejects.toThrow(/invalid where column/i);
    });
  });

  it("filter throws on invalid orderBy column", async () => {
    await withTestTx(async (tx) => {
      const repo = new ProjectRepository(tx);

      await expect(
        repo.filter({ orderBy: { key: "nope" } as any }),
      ).rejects.toThrow(/invalid orderBy column/i);
    });
  });
});
