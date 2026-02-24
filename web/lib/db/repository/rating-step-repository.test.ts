import { describe, expect, it } from "vitest";
import type { Conn } from "@/lib/db/core";
import { benchmarks, datasets, projects, ratingSteps } from "@/lib/db/schema";
import { withTestTx } from "@/test/helpers/db";
import { OrderDirection } from "../query-options";
import { BenchmarkCreateSchema } from "./benchmark-repository";
import { DatasetCreateSchema } from "./dataset-repository";
import {
  RatingStepCreateSchema,
  RatingStepRepository,
} from "./rating-step-repository";

describe("RatingStepRepository", () => {
  async function seed(tx: Conn) {
    const ratingStepRepo = new RatingStepRepository(tx);

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

    const [benchmark] = await tx
      .insert(benchmarks)
      .values(
        BenchmarkCreateSchema.parse({
          datasetId: dataset.id,
          name: "bm1",
          config: { version: 1 },
          info: { desc: "x" },
        }),
      )
      .returning();
    if (!benchmark) throw new Error("failed to seed benchmark");

    return { project, dataset, benchmark, ratingStepRepo };
  }

  it("save -> find", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, ratingStepRepo } = await seed(tx);

      const saved = await ratingStepRepo.save(
        RatingStepCreateSchema.parse({
          benchmarkId: benchmark.id,
          step: 1,
          stepData: { rankings: [] },
        }),
      );

      const found = await ratingStepRepo.find({ id: saved.id });

      expect(found?.id).toBe(saved.id);
      expect(found?.benchmarkId).toBe(benchmark.id);
      expect(found?.step).toBe(1);
      expect(found?.stepData).toEqual({ rankings: [] });
      expect(found?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll inserts multiple rows", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, ratingStepRepo } = await seed(tx);

      const saved = await ratingStepRepo.saveAll(
        [
          { benchmarkId: benchmark.id, step: 1, stepData: { s: 1 } },
          { benchmarkId: benchmark.id, step: 2, stepData: { s: 2 } },
        ].map((x) => RatingStepCreateSchema.parse(x)),
      );

      expect(saved).toHaveLength(2);
      expect(saved.map((r) => r.step).sort((a, b) => a - b)).toEqual([1, 2]);
      expect(saved[0]?.createdAt).toBeInstanceOf(Date);
      expect(saved[1]?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll returns [] for empty inputs", async () => {
    await withTestTx(async (tx) => {
      const repo = new RatingStepRepository(tx);
      const saved = await repo.saveAll([]);
      expect(saved).toEqual([]);
    });
  });

  it("update updates stepData", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, ratingStepRepo } = await seed(tx);

      const saved = await ratingStepRepo.save(
        RatingStepCreateSchema.parse({
          benchmarkId: benchmark.id,
          step: 1,
          stepData: { before: true },
        }),
      );

      const updated = await ratingStepRepo.update({
        id: saved.id,
        stepData: { after: true },
      });

      expect(updated.id).toBe(saved.id);
      expect(updated.stepData).toEqual({ after: true });

      const found = await ratingStepRepo.find({ id: saved.id });
      expect(found?.stepData).toEqual({ after: true });
    });
  });

  it("update throws when no fields to update", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, ratingStepRepo } = await seed(tx);

      const saved = await ratingStepRepo.save(
        RatingStepCreateSchema.parse({
          benchmarkId: benchmark.id,
          step: 1,
          stepData: { x: 1 },
        }),
      );

      await expect(ratingStepRepo.update({ id: saved.id })).rejects.toThrow(
        "no fields to update",
      );
    });
  });

  it("update throws when rating step not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new RatingStepRepository(tx);

      await expect(
        repo.update({
          id: "00000000-0000-0000-0000-000000000000",
          stepData: { x: 1 },
        }),
      ).rejects.toThrow("rating step not found");
    });
  });

  it("find returns null when not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new RatingStepRepository(tx);

      const found = await repo.find({
        id: "00000000-0000-0000-0000-000000000000",
      });

      expect(found).toBeNull();
    });
  });

  it("filter supports where", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, ratingStepRepo } = await seed(tx);

      const r1 = await ratingStepRepo.save(
        RatingStepCreateSchema.parse({
          benchmarkId: benchmark.id,
          step: 1,
          stepData: { name: "alpha" },
        }),
      );
      await ratingStepRepo.save(
        RatingStepCreateSchema.parse({
          benchmarkId: benchmark.id,
          step: 2,
          stepData: { name: "beta" },
        }),
      );

      const rows = await ratingStepRepo.filter({ where: { id: r1.id } });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(r1.id);
      expect(rows[0]?.step).toBe(1);
    });
  });

  it("filter supports orderBy asc/desc", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, ratingStepRepo } = await seed(tx);

      await ratingStepRepo.saveAll(
        [
          { benchmarkId: benchmark.id, step: 3, stepData: { x: 3 } },
          { benchmarkId: benchmark.id, step: 1, stepData: { x: 1 } },
          { benchmarkId: benchmark.id, step: 2, stepData: { x: 2 } },
        ].map((x) => RatingStepCreateSchema.parse(x)),
      );

      const ascRows = await ratingStepRepo.filter({
        where: { benchmarkId: benchmark.id },
        orderBy: { key: ratingSteps.step, direction: OrderDirection.Asc },
      });
      expect(ascRows.slice(0, 3).map((r) => r.step)).toEqual([1, 2, 3]);

      const descRows = await ratingStepRepo.filter({
        where: { benchmarkId: benchmark.id },
        orderBy: { key: ratingSteps.step, direction: OrderDirection.Desc },
      });
      expect(descRows.slice(0, 3).map((r) => r.step)).toEqual([3, 2, 1]);
    });
  });

  it("filter supports limit/offset", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, ratingStepRepo } = await seed(tx);

      await ratingStepRepo.saveAll(
        [
          { benchmarkId: benchmark.id, step: 1, stepData: { x: 1 } },
          { benchmarkId: benchmark.id, step: 2, stepData: { x: 2 } },
          { benchmarkId: benchmark.id, step: 3, stepData: { x: 3 } },
        ].map((x) => RatingStepCreateSchema.parse(x)),
      );

      const rows = await ratingStepRepo.filter({
        where: { benchmarkId: benchmark.id },
        orderBy: { key: ratingSteps.step, direction: OrderDirection.Asc },
        limit: 2,
        offset: 1,
      });

      expect(rows.map((r) => r.step)).toEqual([2, 3]);
    });
  });

  it("filter throws on invalid where column", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, ratingStepRepo } = await seed(tx);

      await ratingStepRepo.save(
        RatingStepCreateSchema.parse({
          benchmarkId: benchmark.id,
          step: 1,
          stepData: { x: 1 },
        }),
      );

      await expect(
        ratingStepRepo.filter({ where: { nope: "x" } as any }),
      ).rejects.toThrow(/invalid where column/i);
    });
  });

  it("filter throws on invalid orderBy column", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, ratingStepRepo } = await seed(tx);

      await ratingStepRepo.save(
        RatingStepCreateSchema.parse({
          benchmarkId: benchmark.id,
          step: 1,
          stepData: { x: 1 },
        }),
      );

      await expect(
        ratingStepRepo.filter({ orderBy: { key: "nope" } as any }),
      ).rejects.toThrow(/invalid orderBy column/i);
    });
  });

  it("save throws on duplicate (benchmarkId, step) due to unique constraint", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, ratingStepRepo } = await seed(tx);

      await ratingStepRepo.save(
        RatingStepCreateSchema.parse({
          benchmarkId: benchmark.id,
          step: 1,
          stepData: { x: 1 },
        }),
      );

      // withTestTx が例外を wrap してメッセージが揺れる環境があるので、ここは「throwする」だけ保証
      await expect(
        ratingStepRepo.save(
          RatingStepCreateSchema.parse({
            benchmarkId: benchmark.id,
            step: 1,
            stepData: { x: 2 },
          }),
        ),
      ).rejects.toThrow();
    });
  });
});
