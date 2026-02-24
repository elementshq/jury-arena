import { describe, expect, it } from "vitest";
import type { Conn } from "@/lib/db/core";
import { datasets, projects } from "@/lib/db/schema";
import { withTestTx } from "@/test/helpers/db";
import { OrderDirection } from "../query-options";
import { DatasetCreateSchema, DatasetRepository } from "./dataset-repository";

describe("DatasetRepository", () => {
  async function seed(tx: Conn) {
    const repo = new DatasetRepository(tx);

    const [project] = await tx
      .insert(projects)
      .values({ name: "p1" })
      .returning();
    if (!project) throw new Error("failed to seed project");

    return { project, repo };
  }

  it("save -> find", async () => {
    await withTestTx(async (tx) => {
      const { project, repo } = await seed(tx);

      const saved = await repo.save(
        DatasetCreateSchema.parse({ projectId: project.id, name: "ds1" }),
      );
      const found = await repo.find({ id: saved.id });

      expect(found?.id).toBe(saved.id);
      expect(found?.projectId).toBe(project.id);
      expect(found?.name).toBe("ds1");
      expect(found?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll inserts multiple rows", async () => {
    await withTestTx(async (tx) => {
      const { project, repo } = await seed(tx);

      const saved = await repo.saveAll(
        [
          { projectId: project.id, name: "a" },
          { projectId: project.id, name: "b" },
        ].map((x) => DatasetCreateSchema.parse(x)),
      );

      expect(saved).toHaveLength(2);
      expect(saved.map((r) => r.name).sort()).toEqual(["a", "b"]);
      expect(saved[0]?.createdAt).toBeInstanceOf(Date);
      expect(saved[1]?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll returns [] for empty inputs", async () => {
    await withTestTx(async (tx) => {
      const repo = new DatasetRepository(tx);

      const saved = await repo.saveAll([]);
      expect(saved).toEqual([]);
    });
  });

  it("update updates name", async () => {
    await withTestTx(async (tx) => {
      const { project, repo } = await seed(tx);

      const saved = await repo.save(
        DatasetCreateSchema.parse({ projectId: project.id, name: "before" }),
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
      const { project, repo } = await seed(tx);

      const saved = await repo.save(
        DatasetCreateSchema.parse({ projectId: project.id, name: "ds" }),
      );

      await expect(repo.update({ id: saved.id })).rejects.toThrow(
        "no fields to update",
      );
    });
  });

  it("update throws when dataset not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new DatasetRepository(tx);

      await expect(
        repo.update({
          id: "00000000-0000-0000-0000-000000000000",
          name: "x",
        }),
      ).rejects.toThrow("dataset not found");
    });
  });

  it("find returns null when not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new DatasetRepository(tx);

      const found = await repo.find({
        id: "00000000-0000-0000-0000-000000000000",
      });

      expect(found).toBeNull();
    });
  });

  it("filter supports where", async () => {
    await withTestTx(async (tx) => {
      const { project, repo } = await seed(tx);

      const d1 = await repo.save(
        DatasetCreateSchema.parse({ projectId: project.id, name: "alpha" }),
      );
      await repo.save(
        DatasetCreateSchema.parse({ projectId: project.id, name: "beta" }),
      );

      const rows = await repo.filter({ where: { id: d1.id } });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(d1.id);
      expect(rows[0]?.name).toBe("alpha");
    });
  });

  it("filter supports orderBy asc/desc", async () => {
    await withTestTx(async (tx) => {
      const { project, repo } = await seed(tx);

      await repo.saveAll(
        [
          { projectId: project.id, name: "c" },
          { projectId: project.id, name: "a" },
          { projectId: project.id, name: "b" },
        ].map((x) => DatasetCreateSchema.parse(x)),
      );

      const ascRows = await repo.filter({
        where: { projectId: project.id },
        orderBy: { key: datasets.name, direction: OrderDirection.Asc },
      });
      expect(ascRows.slice(0, 3).map((r) => r.name)).toEqual(["a", "b", "c"]);

      const descRows = await repo.filter({
        where: { projectId: project.id },
        orderBy: { key: datasets.name, direction: OrderDirection.Desc },
      });
      expect(descRows.slice(0, 3).map((r) => r.name)).toEqual(["c", "b", "a"]);
    });
  });

  it("filter supports limit/offset", async () => {
    await withTestTx(async (tx) => {
      const { project, repo } = await seed(tx);

      await repo.saveAll(
        [
          { projectId: project.id, name: "a" },
          { projectId: project.id, name: "b" },
          { projectId: project.id, name: "c" },
        ].map((x) => DatasetCreateSchema.parse(x)),
      );

      const rows = await repo.filter({
        where: { projectId: project.id },
        orderBy: { key: datasets.name, direction: OrderDirection.Asc },
        limit: 2,
        offset: 1,
      });

      expect(rows.map((r) => r.name)).toEqual(["b", "c"]);
    });
  });

  it("filter throws on invalid where column", async () => {
    await withTestTx(async (tx) => {
      const { project, repo } = await seed(tx);

      await repo.save(
        DatasetCreateSchema.parse({ projectId: project.id, name: "ds" }),
      );

      await expect(
        repo.filter({ where: { nope: "x" } as any }),
      ).rejects.toThrow(/invalid where column/i);
    });
  });

  it("filter throws on invalid orderBy column", async () => {
    await withTestTx(async (tx) => {
      const { project, repo } = await seed(tx);

      await repo.save(
        DatasetCreateSchema.parse({ projectId: project.id, name: "ds" }),
      );

      await expect(
        repo.filter({ orderBy: { key: "nope" } as any }),
      ).rejects.toThrow(/invalid orderBy column/i);
    });
  });

  it("save throws on duplicate (projectId, name) due to unique constraint", async () => {
    await withTestTx(async (tx) => {
      const { project, repo } = await seed(tx);

      await repo.save(
        DatasetCreateSchema.parse({ projectId: project.id, name: "dup" }),
      );

      // withTestTx が例外を wrap してメッセージが揺れる環境があるので、ここは「throwする」だけ保証
      await expect(
        repo.save(
          DatasetCreateSchema.parse({ projectId: project.id, name: "dup" }),
        ),
      ).rejects.toThrow();
    });
  });
});
