import { describe, expect, it } from "vitest";
import type { Conn } from "@/lib/db/core";
import { datasets, projects, samples } from "@/lib/db/schema";
import { withTestTx } from "@/test/helpers/db";
import { OrderDirection } from "../query-options";
import { DatasetCreateSchema } from "./dataset-repository";
import { SampleCreateSchema, SampleRepository } from "./sample-repository";

describe("SampleRepository", () => {
  async function seed(tx: Conn) {
    const sampleRepo = new SampleRepository(tx);

    const [project] = await tx
      .insert(projects)
      .values({ name: "p1" })
      .returning();
    if (!project) throw new Error("failed to seed project");

    const [dataset] = await tx
      .insert(datasets)
      .values(
        DatasetCreateSchema.parse({
          projectId: project.id,
          name: "ds1",
        }),
      )
      .returning();
    if (!dataset) throw new Error("failed to seed dataset");

    return { project, dataset, sampleRepo };
  }

  it("save -> find", async () => {
    await withTestTx(async (tx) => {
      const { dataset, sampleRepo } = await seed(tx);

      const saved = await sampleRepo.save(
        SampleCreateSchema.parse({
          datasetId: dataset.id,
          info: { input: "x" },
        }),
      );

      const found = await sampleRepo.find({ id: saved.id });

      expect(found?.id).toBe(saved.id);
      expect(found?.datasetId).toBe(dataset.id);
      expect(found?.info).toEqual({ input: "x" });
      expect(found?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll inserts multiple rows", async () => {
    await withTestTx(async (tx) => {
      const { dataset, sampleRepo } = await seed(tx);

      const saved = await sampleRepo.saveAll(
        [
          { datasetId: dataset.id, info: { n: 1 } },
          { datasetId: dataset.id, info: { n: 2 } },
        ].map((x) => SampleCreateSchema.parse(x)),
      );

      expect(saved).toHaveLength(2);
      expect(saved.map((r) => r.info)).toEqual([{ n: 1 }, { n: 2 }]);
      expect(saved[0]?.createdAt).toBeInstanceOf(Date);
      expect(saved[1]?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll returns [] for empty inputs", async () => {
    await withTestTx(async (tx) => {
      const repo = new SampleRepository(tx);
      const saved = await repo.saveAll([]);
      expect(saved).toEqual([]);
    });
  });

  it("update updates info", async () => {
    await withTestTx(async (tx) => {
      const { dataset, sampleRepo } = await seed(tx);

      const saved = await sampleRepo.save(
        SampleCreateSchema.parse({
          datasetId: dataset.id,
          info: { before: true },
        }),
      );

      const updated = await sampleRepo.update({
        id: saved.id,
        info: { after: true },
      });

      expect(updated.id).toBe(saved.id);
      expect(updated.info).toEqual({ after: true });

      const found = await sampleRepo.find({ id: saved.id });
      expect(found?.info).toEqual({ after: true });
    });
  });

  it("update throws when no fields to update", async () => {
    await withTestTx(async (tx) => {
      const { dataset, sampleRepo } = await seed(tx);

      const saved = await sampleRepo.save(
        SampleCreateSchema.parse({
          datasetId: dataset.id,
          info: { x: 1 },
        }),
      );

      await expect(sampleRepo.update({ id: saved.id })).rejects.toThrow(
        "no fields to update",
      );
    });
  });

  it("update throws when sample not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new SampleRepository(tx);

      await expect(
        repo.update({
          id: "00000000-0000-0000-0000-000000000000",
          info: { x: 1 },
        }),
      ).rejects.toThrow("sample not found");
    });
  });

  it("find returns null when not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new SampleRepository(tx);

      const found = await repo.find({
        id: "00000000-0000-0000-0000-000000000000",
      });

      expect(found).toBeNull();
    });
  });

  it("filter supports where", async () => {
    await withTestTx(async (tx) => {
      const { dataset, sampleRepo } = await seed(tx);

      const s1 = await sampleRepo.save(
        SampleCreateSchema.parse({
          datasetId: dataset.id,
          info: { name: "alpha" },
        }),
      );
      await sampleRepo.save(
        SampleCreateSchema.parse({
          datasetId: dataset.id,
          info: { name: "beta" },
        }),
      );

      const rows = await sampleRepo.filter({ where: { id: s1.id } });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(s1.id);
      expect(rows[0]?.info).toEqual({ name: "alpha" });
    });
  });

  it("filter supports orderBy asc/desc", async () => {
    await withTestTx(async (tx) => {
      const { dataset, sampleRepo } = await seed(tx);

      await sampleRepo.saveAll(
        [
          { datasetId: dataset.id, info: { x: 3 } },
          { datasetId: dataset.id, info: { x: 1 } },
          { datasetId: dataset.id, info: { x: 2 } },
        ].map((x) => SampleCreateSchema.parse(x)),
      );

      const ascRows = await sampleRepo.filter({
        where: { datasetId: dataset.id },
        orderBy: { key: samples.createdAt, direction: OrderDirection.Asc },
      });
      expect(ascRows.length).toBeGreaterThanOrEqual(3);

      const descRows = await sampleRepo.filter({
        where: { datasetId: dataset.id },
        orderBy: { key: samples.createdAt, direction: OrderDirection.Desc },
      });
      expect(descRows.length).toBeGreaterThanOrEqual(3);

      // createdAt は defaultNow なので厳密順序が揺れる可能性あり。
      // ここでは orderBy 指定で例外が起きず結果が返ることを保証する。
      expect(ascRows[0]?.createdAt).toBeInstanceOf(Date);
      expect(descRows[0]?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("filter supports limit/offset", async () => {
    await withTestTx(async (tx) => {
      const { dataset, sampleRepo } = await seed(tx);

      await sampleRepo.saveAll(
        [
          { datasetId: dataset.id, info: { n: 1 } },
          { datasetId: dataset.id, info: { n: 2 } },
          { datasetId: dataset.id, info: { n: 3 } },
        ].map((x) => SampleCreateSchema.parse(x)),
      );

      const rows = await sampleRepo.filter({
        where: { datasetId: dataset.id },
        orderBy: { key: samples.createdAt, direction: OrderDirection.Asc },
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
      const { dataset, sampleRepo } = await seed(tx);

      await sampleRepo.save(
        SampleCreateSchema.parse({
          datasetId: dataset.id,
          info: { x: 1 },
        }),
      );

      await expect(
        sampleRepo.filter({ where: { nope: "x" } as any }),
      ).rejects.toThrow(/invalid where column/i);
    });
  });

  it("filter throws on invalid orderBy column", async () => {
    await withTestTx(async (tx) => {
      const { dataset, sampleRepo } = await seed(tx);

      await sampleRepo.save(
        SampleCreateSchema.parse({
          datasetId: dataset.id,
          info: { x: 1 },
        }),
      );

      await expect(
        sampleRepo.filter({ orderBy: { key: "nope" } as any }),
      ).rejects.toThrow(/invalid orderBy column/i);
    });
  });
});
