import { describe, expect, it } from "vitest";
import type { Conn } from "@/lib/db/core";
import { benchmarks, datasets, projects, samples, trials } from "@/lib/db/schema";
import { withTestTx } from "@/test/helpers/db";
import { OrderDirection } from "../query-options";
import { DatasetCreateSchema } from "./dataset-repository";
import { SampleCreateSchema } from "./sample-repository";
import { TrialCreateSchema, TrialRepository } from "./trial-repository";

describe("TrialRepository", () => {
  async function seed(tx: Conn) {
    const trialRepo = new TrialRepository(tx);

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

    const [sample] = await tx
      .insert(samples)
      .values(
        SampleCreateSchema.parse({
          id: "test-sample-001",
          datasetId: dataset.id,
          info: { input: "x" },
        }),
      )
      .returning();
    if (!sample) throw new Error("failed to seed sample");

    const [benchmark] = await tx
      .insert(benchmarks)
      .values({
        datasetId: dataset.id,
        name: "bench1",
        config: {},
        info: {},
      })
      .returning();
    if (!benchmark) throw new Error("failed to seed benchmark");

    return { project, dataset, sample, benchmark, trialRepo };
  }

  it("save -> find", async () => {
    await withTestTx(async (tx) => {
      const { sample, benchmark, trialRepo } = await seed(tx);

      const saved = await trialRepo.save(
        TrialCreateSchema.parse({
          benchmarkId: benchmark.id,
          sampleId: sample.id,
          modelName: "gpt-4.1-mini",
          result: { output: "ok", tokens: 10 },
          costUsd: "0.001",
        }),
      );

      const found = await trialRepo.find({ id: saved.id });

      expect(found?.id).toBe(saved.id);
      expect(found?.sampleId).toBe(sample.id);
      expect(found?.modelName).toBe("gpt-4.1-mini");
      expect(found?.result).toEqual({ output: "ok", tokens: 10 });
      expect(found?.costUsd).toBe("0.001");
      expect(found?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll inserts multiple rows", async () => {
    await withTestTx(async (tx) => {
      const { sample, benchmark, trialRepo } = await seed(tx);

      const saved = await trialRepo.saveAll(
        [
          {
            benchmarkId: benchmark.id,
            sampleId: sample.id,
            modelName: "m1",
            result: { x: 1 },
            costUsd: "0.1",
          },
          {
            benchmarkId: benchmark.id,
            sampleId: sample.id,
            modelName: "m2",
            result: { x: 2 },
            costUsd: "0.2",
          },
        ].map((x) => TrialCreateSchema.parse(x)),
      );

      expect(saved).toHaveLength(2);
      expect(saved.map((r) => r.modelName).sort()).toEqual(["m1", "m2"]);
      expect(saved[0]?.createdAt).toBeInstanceOf(Date);
      expect(saved[1]?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll returns [] for empty inputs", async () => {
    await withTestTx(async (tx) => {
      const repo = new TrialRepository(tx);
      const saved = await repo.saveAll([]);
      expect(saved).toEqual([]);
    });
  });

  it("update updates fields", async () => {
    await withTestTx(async (tx) => {
      const { sample, benchmark, trialRepo } = await seed(tx);

      const saved = await trialRepo.save(
        TrialCreateSchema.parse({
          benchmarkId: benchmark.id,
          sampleId: sample.id,
          modelName: "before",
          result: { before: true },
          costUsd: "0.1",
        }),
      );

      const updated = await trialRepo.update({
        id: saved.id,
        modelName: "after",
        result: { after: true },
      });

      expect(updated.id).toBe(saved.id);
      expect(updated.modelName).toBe("after");
      expect(updated.result).toEqual({ after: true });

      const found = await trialRepo.find({ id: saved.id });
      expect(found?.modelName).toBe("after");
      expect(found?.result).toEqual({ after: true });
    });
  });

  it("update throws when no fields to update", async () => {
    await withTestTx(async (tx) => {
      const { sample, benchmark, trialRepo } = await seed(tx);

      const saved = await trialRepo.save(
        TrialCreateSchema.parse({
          benchmarkId: benchmark.id,
          sampleId: sample.id,
          modelName: "m",
          result: { x: 1 },
          costUsd: "0.1",
        }),
      );

      await expect(trialRepo.update({ id: saved.id })).rejects.toThrow(
        "no fields to update",
      );
    });
  });

  it("update throws when trial not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new TrialRepository(tx);

      await expect(
        repo.update({
          id: "00000000-0000-0000-0000-000000000000",
          result: { x: 1 },
        }),
      ).rejects.toThrow("trial not found");
    });
  });

  it("find returns null when not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new TrialRepository(tx);

      const found = await repo.find({
        id: "00000000-0000-0000-0000-000000000000",
      });

      expect(found).toBeNull();
    });
  });

  it("filter supports where", async () => {
    await withTestTx(async (tx) => {
      const { sample, benchmark, trialRepo } = await seed(tx);

      const t1 = await trialRepo.save(
        TrialCreateSchema.parse({
          benchmarkId: benchmark.id,
          sampleId: sample.id,
          modelName: "alpha",
          result: { name: "alpha" },
          costUsd: "0.1",
        }),
      );
      await trialRepo.save(
        TrialCreateSchema.parse({
          benchmarkId: benchmark.id,
          sampleId: sample.id,
          modelName: "beta",
          result: { name: "beta" },
          costUsd: "0.2",
        }),
      );

      const rows = await trialRepo.filter({ where: { id: t1.id } });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(t1.id);
      expect(rows[0]?.modelName).toBe("alpha");
    });
  });

  it("filter supports orderBy asc/desc", async () => {
    await withTestTx(async (tx) => {
      const { sample, benchmark, trialRepo } = await seed(tx);

      await trialRepo.saveAll(
        [
          {
            benchmarkId: benchmark.id,
            sampleId: sample.id,
            modelName: "c",
            result: { x: 3 },
            costUsd: "0.3",
          },
          {
            benchmarkId: benchmark.id,
            sampleId: sample.id,
            modelName: "a",
            result: { x: 1 },
            costUsd: "0.1",
          },
          {
            benchmarkId: benchmark.id,
            sampleId: sample.id,
            modelName: "b",
            result: { x: 2 },
            costUsd: "0.2",
          },
        ].map((x) => TrialCreateSchema.parse(x)),
      );

      const ascRows = await trialRepo.filter({
        where: { sampleId: sample.id },
        orderBy: { key: trials.modelName, direction: OrderDirection.Asc },
      });
      expect(ascRows.slice(0, 3).map((r) => r.modelName)).toEqual([
        "a",
        "b",
        "c",
      ]);

      const descRows = await trialRepo.filter({
        where: { sampleId: sample.id },
        orderBy: { key: trials.modelName, direction: OrderDirection.Desc },
      });
      expect(descRows.slice(0, 3).map((r) => r.modelName)).toEqual([
        "c",
        "b",
        "a",
      ]);
    });
  });

  it("filter supports limit/offset", async () => {
    await withTestTx(async (tx) => {
      const { sample, benchmark, trialRepo } = await seed(tx);

      await trialRepo.saveAll(
        [
          {
            benchmarkId: benchmark.id,
            sampleId: sample.id,
            modelName: "a",
            result: { x: 1 },
            costUsd: "0.1",
          },
          {
            benchmarkId: benchmark.id,
            sampleId: sample.id,
            modelName: "b",
            result: { x: 2 },
            costUsd: "0.2",
          },
          {
            benchmarkId: benchmark.id,
            sampleId: sample.id,
            modelName: "c",
            result: { x: 3 },
            costUsd: "0.3",
          },
        ].map((x) => TrialCreateSchema.parse(x)),
      );

      const rows = await trialRepo.filter({
        where: { sampleId: sample.id },
        orderBy: { key: trials.modelName, direction: OrderDirection.Asc },
        limit: 2,
        offset: 1,
      });

      expect(rows.map((r) => r.modelName)).toEqual(["b", "c"]);
    });
  });

  it("filter throws on invalid where column", async () => {
    await withTestTx(async (tx) => {
      const { sample, benchmark, trialRepo } = await seed(tx);

      await trialRepo.save(
        TrialCreateSchema.parse({
          benchmarkId: benchmark.id,
          sampleId: sample.id,
          modelName: "m",
          result: { x: 1 },
          costUsd: "0.1",
        }),
      );

      await expect(
        trialRepo.filter({ where: { nope: "x" } as any }),
      ).rejects.toThrow(/invalid where column/i);
    });
  });

  it("filter throws on invalid orderBy column", async () => {
    await withTestTx(async (tx) => {
      const { sample, benchmark, trialRepo } = await seed(tx);

      await trialRepo.save(
        TrialCreateSchema.parse({
          benchmarkId: benchmark.id,
          sampleId: sample.id,
          modelName: "m",
          result: { x: 1 },
          costUsd: "0.1",
        }),
      );

      await expect(
        trialRepo.filter({ orderBy: { key: "nope" } as any }),
      ).rejects.toThrow(/invalid orderBy column/i);
    });
  });

  it("save throws on duplicate (benchmarkId, sampleId, modelName) due to unique constraint", async () => {
    await withTestTx(async (tx) => {
      const { sample, benchmark, trialRepo } = await seed(tx);

      await trialRepo.save(
        TrialCreateSchema.parse({
          benchmarkId: benchmark.id,
          sampleId: sample.id,
          modelName: "dup",
          result: { x: 1 },
          costUsd: "0.1",
        }),
      );

      // withTestTx が例外を wrap してメッセージが揺れる環境があるので、ここは「throwする」だけ保証
      await expect(
        trialRepo.save(
          TrialCreateSchema.parse({
            benchmarkId: benchmark.id,
            sampleId: sample.id,
            modelName: "dup",
            result: { x: 2 },
            costUsd: "0.2",
          }),
        ),
      ).rejects.toThrow();
    });
  });

  it("different benchmarkId with same (sampleId, modelName) should NOT conflict", async () => {
    await withTestTx(async (tx) => {
      const { sample, benchmark, dataset, trialRepo } = await seed(tx);

      // 2つ目の benchmark を作る
      const [benchmark2] = await tx
        .insert(benchmarks)
        .values({
          datasetId: dataset.id,
          name: "bench2",
          config: {},
          info: {},
        })
        .returning();
      if (!benchmark2) throw new Error("failed to seed benchmark2");

      const saved1 = await trialRepo.save(
        TrialCreateSchema.parse({
          benchmarkId: benchmark.id,
          sampleId: sample.id,
          modelName: "same-model",
          result: { from: "bench1" },
          costUsd: "0.1",
        }),
      );

      const saved2 = await trialRepo.save(
        TrialCreateSchema.parse({
          benchmarkId: benchmark2.id,
          sampleId: sample.id,
          modelName: "same-model",
          result: { from: "bench2" },
          costUsd: "0.2",
        }),
      );

      // 両方保存できること
      expect(saved1.id).not.toBe(saved2.id);
      expect(saved1.benchmarkId).toBe(benchmark.id);
      expect(saved2.benchmarkId).toBe(benchmark2.id);

      // それぞれ独立した結果を保持
      const found1 = await trialRepo.find({ id: saved1.id });
      const found2 = await trialRepo.find({ id: saved2.id });
      expect(found1?.result).toEqual({ from: "bench1" });
      expect(found2?.result).toEqual({ from: "bench2" });
    });
  });
});
