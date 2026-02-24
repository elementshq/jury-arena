import { describe, expect, it } from "vitest";
import type { Conn } from "@/lib/db/core";
import { benchmarks, datasets, projects } from "@/lib/db/schema";
import { withTestTx } from "@/test/helpers/db";
import { OrderDirection } from "../query-options";
import {
  BenchmarkCreateSchema,
  BenchmarkRepository,
} from "./benchmark-repository";
import { DatasetCreateSchema } from "./dataset-repository";

describe("BenchmarkRepository", () => {
  async function seed(tx: Conn) {
    const benchmarkRepo = new BenchmarkRepository(tx);

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

    return { project, dataset, benchmarkRepo };
  }

  it("save -> find", async () => {
    await withTestTx(async (tx) => {
      const { dataset, benchmarkRepo } = await seed(tx);

      const saved = await benchmarkRepo.save(
        BenchmarkCreateSchema.parse({
          datasetId: dataset.id,
          name: "bm1",
          config: { version: 1 },
          info: { desc: "x" },
        }),
      );

      const found = await benchmarkRepo.find({ id: saved.id });

      expect(found?.id).toBe(saved.id);
      expect(found?.datasetId).toBe(dataset.id);
      expect(found?.name).toBe("bm1");
      expect(found?.config).toEqual({ version: 1 });
      expect(found?.info).toEqual({ desc: "x" });
      expect(found?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll inserts multiple rows", async () => {
    await withTestTx(async (tx) => {
      const { dataset, benchmarkRepo } = await seed(tx);

      const saved = await benchmarkRepo.saveAll(
        [
          {
            datasetId: dataset.id,
            name: "a",
            config: { v: 1 },
            info: { i: "a" },
          },
          {
            datasetId: dataset.id,
            name: "b",
            config: { v: 1 },
            info: { i: "b" },
          },
        ].map((x) => BenchmarkCreateSchema.parse(x)),
      );

      expect(saved).toHaveLength(2);
      expect(saved.map((r) => r.name).sort()).toEqual(["a", "b"]);
      expect(saved[0]?.createdAt).toBeInstanceOf(Date);
      expect(saved[1]?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll returns [] for empty inputs", async () => {
    await withTestTx(async (tx) => {
      const repo = new BenchmarkRepository(tx);
      const saved = await repo.saveAll([]);
      expect(saved).toEqual([]);
    });
  });

  it("update updates fields", async () => {
    await withTestTx(async (tx) => {
      const { dataset, benchmarkRepo } = await seed(tx);

      const saved = await benchmarkRepo.save(
        BenchmarkCreateSchema.parse({
          datasetId: dataset.id,
          name: "before",
          config: { v: 1 },
          info: { i: "x" },
        }),
      );

      const updated = await benchmarkRepo.update({
        id: saved.id,
        name: "after",
      });

      expect(updated.id).toBe(saved.id);
      expect(updated.name).toBe("after");

      const found = await benchmarkRepo.find({ id: saved.id });
      expect(found?.name).toBe("after");
    });
  });

  it("update throws when no fields to update", async () => {
    await withTestTx(async (tx) => {
      const { dataset, benchmarkRepo } = await seed(tx);

      const saved = await benchmarkRepo.save(
        BenchmarkCreateSchema.parse({
          datasetId: dataset.id,
          name: "bm",
          config: { v: 1 },
          info: { i: "x" },
        }),
      );

      await expect(benchmarkRepo.update({ id: saved.id })).rejects.toThrow(
        "no fields to update",
      );
    });
  });

  it("update throws when benchmark not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new BenchmarkRepository(tx);

      await expect(
        repo.update({
          id: "00000000-0000-0000-0000-000000000000",
          name: "x",
        }),
      ).rejects.toThrow("benchmark not found");
    });
  });

  it("find returns null when not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new BenchmarkRepository(tx);

      const found = await repo.find({
        id: "00000000-0000-0000-0000-000000000000",
      });

      expect(found).toBeNull();
    });
  });

  it("filter supports where", async () => {
    await withTestTx(async (tx) => {
      const { dataset, benchmarkRepo } = await seed(tx);

      const b1 = await benchmarkRepo.save(
        BenchmarkCreateSchema.parse({
          datasetId: dataset.id,
          name: "alpha",
          config: { v: 1 },
          info: { i: "alpha" },
        }),
      );
      await benchmarkRepo.save(
        BenchmarkCreateSchema.parse({
          datasetId: dataset.id,
          name: "beta",
          config: { v: 1 },
          info: { i: "beta" },
        }),
      );

      const rows = await benchmarkRepo.filter({ where: { id: b1.id } });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(b1.id);
      expect(rows[0]?.name).toBe("alpha");
    });
  });

  it("filter supports orderBy asc/desc", async () => {
    await withTestTx(async (tx) => {
      const { dataset, benchmarkRepo } = await seed(tx);

      await benchmarkRepo.saveAll(
        [
          {
            datasetId: dataset.id,
            name: "c",
            config: { v: 1 },
            info: { i: "c" },
          },
          {
            datasetId: dataset.id,
            name: "a",
            config: { v: 1 },
            info: { i: "a" },
          },
          {
            datasetId: dataset.id,
            name: "b",
            config: { v: 1 },
            info: { i: "b" },
          },
        ].map((x) => BenchmarkCreateSchema.parse(x)),
      );

      const ascRows = await benchmarkRepo.filter({
        where: { datasetId: dataset.id },
        orderBy: { key: benchmarks.name, direction: OrderDirection.Asc },
      });
      expect(ascRows.slice(0, 3).map((r) => r.name)).toEqual(["a", "b", "c"]);

      const descRows = await benchmarkRepo.filter({
        where: { datasetId: dataset.id },
        orderBy: { key: benchmarks.name, direction: OrderDirection.Desc },
      });
      expect(descRows.slice(0, 3).map((r) => r.name)).toEqual(["c", "b", "a"]);
    });
  });

  it("filter supports limit/offset", async () => {
    await withTestTx(async (tx) => {
      const { dataset, benchmarkRepo } = await seed(tx);

      await benchmarkRepo.saveAll(
        [
          {
            datasetId: dataset.id,
            name: "a",
            config: { v: 1 },
            info: { i: "a" },
          },
          {
            datasetId: dataset.id,
            name: "b",
            config: { v: 1 },
            info: { i: "b" },
          },
          {
            datasetId: dataset.id,
            name: "c",
            config: { v: 1 },
            info: { i: "c" },
          },
        ].map((x) => BenchmarkCreateSchema.parse(x)),
      );

      const rows = await benchmarkRepo.filter({
        where: { datasetId: dataset.id },
        orderBy: { key: benchmarks.name, direction: OrderDirection.Asc },
        limit: 2,
        offset: 1,
      });

      expect(rows.map((r) => r.name)).toEqual(["b", "c"]);
    });
  });

  it("filter throws on invalid where column", async () => {
    await withTestTx(async (tx) => {
      const { dataset, benchmarkRepo } = await seed(tx);

      await benchmarkRepo.save(
        BenchmarkCreateSchema.parse({
          datasetId: dataset.id,
          name: "bm",
          config: { v: 1 },
          info: { i: "x" },
        }),
      );

      await expect(
        benchmarkRepo.filter({ where: { nope: "x" } as any }),
      ).rejects.toThrow(/invalid where column/i);
    });
  });

  it("filter throws on invalid orderBy column", async () => {
    await withTestTx(async (tx) => {
      const { dataset, benchmarkRepo } = await seed(tx);

      await benchmarkRepo.save(
        BenchmarkCreateSchema.parse({
          datasetId: dataset.id,
          name: "bm",
          config: { v: 1 },
          info: { i: "x" },
        }),
      );

      await expect(
        benchmarkRepo.filter({ orderBy: { key: "nope" } as any }),
      ).rejects.toThrow(/invalid orderBy column/i);
    });
  });

  it("save throws on duplicate (datasetId, name) due to unique constraint", async () => {
    await withTestTx(async (tx) => {
      const { dataset, benchmarkRepo } = await seed(tx);

      await benchmarkRepo.save(
        BenchmarkCreateSchema.parse({
          datasetId: dataset.id,
          name: "dup",
          config: { v: 1 },
          info: { i: "x" },
        }),
      );

      // withTestTx が例外を wrap してメッセージが揺れる環境があるので、ここは「throwする」だけ保証
      await expect(
        benchmarkRepo.save(
          BenchmarkCreateSchema.parse({
            datasetId: dataset.id,
            name: "dup",
            config: { v: 1 },
            info: { i: "y" },
          }),
        ),
      ).rejects.toThrow();
    });
  });
});
