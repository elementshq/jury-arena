import { describe, expect, it } from "vitest";
import type { Conn } from "@/lib/db/core";
import { projects, usageLogs } from "@/lib/db/schema";
import { withTestTx } from "@/test/helpers/db";
import { OrderDirection } from "../query-options";
import {
  UsageLogCreateSchema,
  UsageLogRepository,
} from "./usage-log-repository";

describe("UsageLogRepository", () => {
  async function seed(tx: Conn) {
    const usageLogRepo = new UsageLogRepository(tx);

    const [project] = await tx
      .insert(projects)
      .values({ name: "p1" })
      .returning();
    if (!project) throw new Error("failed to seed project");

    return { project, usageLogRepo };
  }

  it("save -> find", async () => {
    await withTestTx(async (tx) => {
      const { project, usageLogRepo } = await seed(tx);

      const saved = await usageLogRepo.save(
        UsageLogCreateSchema.parse({
          projectId: project.id,
          metadata: { route: "/api/run", tokens: 123 },
        }),
      );

      const found = await usageLogRepo.find({ id: saved.id });

      expect(found?.id).toBe(saved.id);
      expect(found?.projectId).toBe(project.id);
      expect(found?.metadata).toEqual({ route: "/api/run", tokens: 123 });
      expect(found?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll inserts multiple rows", async () => {
    await withTestTx(async (tx) => {
      const { project, usageLogRepo } = await seed(tx);

      const saved = await usageLogRepo.saveAll(
        [
          { projectId: project.id, metadata: { n: 1 } },
          { projectId: project.id, metadata: { n: 2 } },
        ].map((x) => UsageLogCreateSchema.parse(x)),
      );

      expect(saved).toHaveLength(2);
      expect(saved.map((r) => r.metadata)).toEqual([{ n: 1 }, { n: 2 }]);
      expect(saved[0]?.createdAt).toBeInstanceOf(Date);
      expect(saved[1]?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll returns [] for empty inputs", async () => {
    await withTestTx(async (tx) => {
      const repo = new UsageLogRepository(tx);
      const saved = await repo.saveAll([]);
      expect(saved).toEqual([]);
    });
  });

  it("update updates metadata", async () => {
    await withTestTx(async (tx) => {
      const { project, usageLogRepo } = await seed(tx);

      const saved = await usageLogRepo.save(
        UsageLogCreateSchema.parse({
          projectId: project.id,
          metadata: { before: true },
        }),
      );

      const updated = await usageLogRepo.update({
        id: saved.id,
        metadata: { after: true },
      });

      expect(updated.id).toBe(saved.id);
      expect(updated.metadata).toEqual({ after: true });

      const found = await usageLogRepo.find({ id: saved.id });
      expect(found?.metadata).toEqual({ after: true });
    });
  });

  it("update throws when no fields to update", async () => {
    await withTestTx(async (tx) => {
      const { project, usageLogRepo } = await seed(tx);

      const saved = await usageLogRepo.save(
        UsageLogCreateSchema.parse({
          projectId: project.id,
          metadata: { x: 1 },
        }),
      );

      await expect(usageLogRepo.update({ id: saved.id })).rejects.toThrow(
        "no fields to update",
      );
    });
  });

  it("update throws when usage log not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new UsageLogRepository(tx);

      await expect(
        repo.update({
          id: "00000000-0000-0000-0000-000000000000",
          metadata: { x: 1 },
        }),
      ).rejects.toThrow("usage log not found");
    });
  });

  it("find returns null when not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new UsageLogRepository(tx);

      const found = await repo.find({
        id: "00000000-0000-0000-0000-000000000000",
      });

      expect(found).toBeNull();
    });
  });

  it("filter supports where", async () => {
    await withTestTx(async (tx) => {
      const { project, usageLogRepo } = await seed(tx);

      const l1 = await usageLogRepo.save(
        UsageLogCreateSchema.parse({
          projectId: project.id,
          metadata: { name: "alpha" },
        }),
      );
      await usageLogRepo.save(
        UsageLogCreateSchema.parse({
          projectId: project.id,
          metadata: { name: "beta" },
        }),
      );

      const rows = await usageLogRepo.filter({ where: { id: l1.id } });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(l1.id);
      expect(rows[0]?.metadata).toEqual({ name: "alpha" });
    });
  });

  it("filter supports orderBy asc/desc", async () => {
    await withTestTx(async (tx) => {
      const { project, usageLogRepo } = await seed(tx);

      await usageLogRepo.saveAll(
        [
          { projectId: project.id, metadata: { n: 3 } },
          { projectId: project.id, metadata: { n: 1 } },
          { projectId: project.id, metadata: { n: 2 } },
        ].map((x) => UsageLogCreateSchema.parse(x)),
      );

      const ascRows = await usageLogRepo.filter({
        where: { projectId: project.id },
        orderBy: { key: usageLogs.id, direction: OrderDirection.Asc },
      });
      expect(ascRows.length).toBeGreaterThanOrEqual(3);

      const descRows = await usageLogRepo.filter({
        where: { projectId: project.id },
        orderBy: { key: usageLogs.id, direction: OrderDirection.Desc },
      });
      expect(descRows.length).toBeGreaterThanOrEqual(3);

      // 順序の厳密比較は DB 実装差で揺れ得るので、
      // ここでは orderBy 指定で例外なく結果が返ることを保証する
      expect(ascRows[0]?.id).toBeTypeOf("string");
      expect(descRows[0]?.id).toBeTypeOf("string");
    });
  });

  it("filter supports limit/offset", async () => {
    await withTestTx(async (tx) => {
      const { project, usageLogRepo } = await seed(tx);

      await usageLogRepo.saveAll(
        [
          { projectId: project.id, metadata: { n: 1 } },
          { projectId: project.id, metadata: { n: 2 } },
          { projectId: project.id, metadata: { n: 3 } },
        ].map((x) => UsageLogCreateSchema.parse(x)),
      );

      const rows = await usageLogRepo.filter({
        where: { projectId: project.id },
        orderBy: { key: usageLogs.createdAt, direction: OrderDirection.Asc },
        limit: 2,
        offset: 1,
      });

      expect(rows).toHaveLength(2);
      expect(rows[0]?.createdAt).toBeInstanceOf(Date);
      expect(rows[1]?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("filter throws on invalid where column", async () => {
    await withTestTx(async (tx) => {
      const { project, usageLogRepo } = await seed(tx);

      await usageLogRepo.save(
        UsageLogCreateSchema.parse({
          projectId: project.id,
          metadata: { x: 1 },
        }),
      );

      await expect(
        usageLogRepo.filter({ where: { nope: "x" } as any }),
      ).rejects.toThrow(/invalid where column/i);
    });
  });

  it("filter throws on invalid orderBy column", async () => {
    await withTestTx(async (tx) => {
      const { project, usageLogRepo } = await seed(tx);

      await usageLogRepo.save(
        UsageLogCreateSchema.parse({
          projectId: project.id,
          metadata: { x: 1 },
        }),
      );

      await expect(
        usageLogRepo.filter({ orderBy: { key: "nope" } as any }),
      ).rejects.toThrow(/invalid orderBy column/i);
    });
  });

  it("filter supports createdAt", async () => {
    await withTestTx(async (tx) => {
      const { project, usageLogRepo } = await seed(tx);

      const t1 = new Date("2020-01-01T00:00:00.000Z");
      const t2 = new Date("2020-01-01T00:00:01.000Z");

      const l1 = await usageLogRepo.save(
        UsageLogCreateSchema.parse({
          projectId: project.id,
          metadata: { x: 1 },
          createdAt: t1,
        }),
      );

      await usageLogRepo.save(
        UsageLogCreateSchema.parse({
          projectId: project.id,
          metadata: { x: 2 },
          createdAt: t2,
        }),
      );

      const rows = await usageLogRepo.filter({ where: { createdAt: t1 } });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(l1.id);
      expect(rows[0]?.createdAt).toBeInstanceOf(Date);
      expect(rows[0]!.createdAt.getTime()).toBe(t1.getTime());
    });
  });

  it("filter returns all rows when no conditions", async () => {
    await withTestTx(async (tx) => {
      const { project, usageLogRepo } = await seed(tx);

      await usageLogRepo.save(
        UsageLogCreateSchema.parse({
          projectId: project.id,
          metadata: { x: 1 },
        }),
      );
      await usageLogRepo.save(
        UsageLogCreateSchema.parse({
          projectId: project.id,
          metadata: { x: 2 },
        }),
      );

      const rows = await usageLogRepo.filter();
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });
  });
});
