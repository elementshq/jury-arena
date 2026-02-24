import { describe, expect, it } from "vitest";
import type { Conn } from "@/lib/db/core";
import {
  arenaMatches,
  benchmarks,
  datasets,
  projects,
  samples,
} from "@/lib/db/schema";
import { withTestTx } from "@/test/helpers/db";
import { OrderDirection } from "../query-options";
import {
  ArenaMatchCreateSchema,
  ArenaMatchRepository,
} from "./arena-match-repository";
import { BenchmarkCreateSchema } from "./benchmark-repository";
import { DatasetCreateSchema } from "./dataset-repository";
import { SampleCreateSchema } from "./sample-repository";

describe("ArenaMatchRepository", () => {
  async function seed(tx: Conn) {
    const arenaMatchRepo = new ArenaMatchRepository(tx);

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
          datasetId: dataset.id,
          info: { input: "x" },
        }),
      )
      .returning();
    if (!sample) throw new Error("failed to seed sample");

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

    return { project, dataset, sample, benchmark, arenaMatchRepo };
  }

  it("save -> find", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, sample, arenaMatchRepo } = await seed(tx);

      const saved = await arenaMatchRepo.save(
        ArenaMatchCreateSchema.parse({
          benchmarkId: benchmark.id,
          matchIndex: 1,
          sampleId: sample.id,
          matchData: { winner: "a" },
        }),
      );

      const found = await arenaMatchRepo.find({ id: saved.id });

      expect(found?.id).toBe(saved.id);
      expect(found?.benchmarkId).toBe(benchmark.id);
      expect(found?.sampleId).toBe(sample.id);
      expect(found?.matchIndex).toBe(1);
      expect(found?.matchData).toEqual({ winner: "a" });
      expect(found?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll inserts multiple rows", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, sample, arenaMatchRepo } = await seed(tx);

      const saved = await arenaMatchRepo.saveAll(
        [
          {
            benchmarkId: benchmark.id,
            matchIndex: 1,
            sampleId: sample.id,
            matchData: { m: 1 },
          },
          {
            benchmarkId: benchmark.id,
            matchIndex: 2,
            sampleId: sample.id,
            matchData: { m: 2 },
          },
        ].map((x) => ArenaMatchCreateSchema.parse(x)),
      );

      expect(saved).toHaveLength(2);
      expect(saved.map((r) => r.matchIndex).sort((a, b) => a - b)).toEqual([
        1, 2,
      ]);
      expect(saved[0]?.createdAt).toBeInstanceOf(Date);
      expect(saved[1]?.createdAt).toBeInstanceOf(Date);
    });
  });

  it("saveAll returns [] for empty inputs", async () => {
    await withTestTx(async (tx) => {
      const repo = new ArenaMatchRepository(tx);
      const saved = await repo.saveAll([]);
      expect(saved).toEqual([]);
    });
  });

  it("update updates matchData", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, sample, arenaMatchRepo } = await seed(tx);

      const saved = await arenaMatchRepo.save(
        ArenaMatchCreateSchema.parse({
          benchmarkId: benchmark.id,
          matchIndex: 1,
          sampleId: sample.id,
          matchData: { before: true },
        }),
      );

      const updated = await arenaMatchRepo.update({
        id: saved.id,
        matchData: { after: true },
      });

      expect(updated.id).toBe(saved.id);
      expect(updated.matchData).toEqual({ after: true });

      const found = await arenaMatchRepo.find({ id: saved.id });
      expect(found?.matchData).toEqual({ after: true });
    });
  });

  it("update throws when no fields to update", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, sample, arenaMatchRepo } = await seed(tx);

      const saved = await arenaMatchRepo.save(
        ArenaMatchCreateSchema.parse({
          benchmarkId: benchmark.id,
          matchIndex: 1,
          sampleId: sample.id,
          matchData: { x: 1 },
        }),
      );

      await expect(arenaMatchRepo.update({ id: saved.id })).rejects.toThrow(
        "no fields to update",
      );
    });
  });

  it("update throws when arena match not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new ArenaMatchRepository(tx);

      await expect(
        repo.update({
          id: "00000000-0000-0000-0000-000000000000",
          matchData: { x: 1 },
        }),
      ).rejects.toThrow("arena match not found");
    });
  });

  it("find returns null when not found", async () => {
    await withTestTx(async (tx) => {
      const repo = new ArenaMatchRepository(tx);

      const found = await repo.find({
        id: "00000000-0000-0000-0000-000000000000",
      });

      expect(found).toBeNull();
    });
  });

  it("filter supports where", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, sample, arenaMatchRepo } = await seed(tx);

      const m1 = await arenaMatchRepo.save(
        ArenaMatchCreateSchema.parse({
          benchmarkId: benchmark.id,
          matchIndex: 1,
          sampleId: sample.id,
          matchData: { name: "alpha" },
        }),
      );

      await arenaMatchRepo.save(
        ArenaMatchCreateSchema.parse({
          benchmarkId: benchmark.id,
          matchIndex: 2,
          sampleId: sample.id,
          matchData: { name: "beta" },
        }),
      );

      const rows = await arenaMatchRepo.filter({ where: { id: m1.id } });

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe(m1.id);
      expect(rows[0]?.matchIndex).toBe(1);
    });
  });

  it("filter supports orderBy asc/desc", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, sample, arenaMatchRepo } = await seed(tx);

      await arenaMatchRepo.saveAll(
        [
          {
            benchmarkId: benchmark.id,
            matchIndex: 3,
            sampleId: sample.id,
            matchData: { x: 3 },
          },
          {
            benchmarkId: benchmark.id,
            matchIndex: 1,
            sampleId: sample.id,
            matchData: { x: 1 },
          },
          {
            benchmarkId: benchmark.id,
            matchIndex: 2,
            sampleId: sample.id,
            matchData: { x: 2 },
          },
        ].map((x) => ArenaMatchCreateSchema.parse(x)),
      );

      const ascRows = await arenaMatchRepo.filter({
        where: { benchmarkId: benchmark.id },
        orderBy: {
          key: arenaMatches.matchIndex,
          direction: OrderDirection.Asc,
        },
      });
      expect(ascRows.slice(0, 3).map((r) => r.matchIndex)).toEqual([1, 2, 3]);

      const descRows = await arenaMatchRepo.filter({
        where: { benchmarkId: benchmark.id },
        orderBy: {
          key: arenaMatches.matchIndex,
          direction: OrderDirection.Desc,
        },
      });
      expect(descRows.slice(0, 3).map((r) => r.matchIndex)).toEqual([3, 2, 1]);
    });
  });

  it("filter supports limit/offset", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, sample, arenaMatchRepo } = await seed(tx);

      await arenaMatchRepo.saveAll(
        [
          {
            benchmarkId: benchmark.id,
            matchIndex: 1,
            sampleId: sample.id,
            matchData: { x: 1 },
          },
          {
            benchmarkId: benchmark.id,
            matchIndex: 2,
            sampleId: sample.id,
            matchData: { x: 2 },
          },
          {
            benchmarkId: benchmark.id,
            matchIndex: 3,
            sampleId: sample.id,
            matchData: { x: 3 },
          },
        ].map((x) => ArenaMatchCreateSchema.parse(x)),
      );

      const rows = await arenaMatchRepo.filter({
        where: { benchmarkId: benchmark.id },
        orderBy: {
          key: arenaMatches.matchIndex,
          direction: OrderDirection.Asc,
        },
        limit: 2,
        offset: 1,
      });

      expect(rows.map((r) => r.matchIndex)).toEqual([2, 3]);
    });
  });

  it("filter throws on invalid where column", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, sample, arenaMatchRepo } = await seed(tx);

      await arenaMatchRepo.save(
        ArenaMatchCreateSchema.parse({
          benchmarkId: benchmark.id,
          matchIndex: 1,
          sampleId: sample.id,
          matchData: { x: 1 },
        }),
      );

      await expect(
        arenaMatchRepo.filter({ where: { nope: "x" } as any }),
      ).rejects.toThrow(/invalid where column/i);
    });
  });

  it("filter throws on invalid orderBy column", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, sample, arenaMatchRepo } = await seed(tx);

      await arenaMatchRepo.save(
        ArenaMatchCreateSchema.parse({
          benchmarkId: benchmark.id,
          matchIndex: 1,
          sampleId: sample.id,
          matchData: { x: 1 },
        }),
      );

      await expect(
        arenaMatchRepo.filter({ orderBy: { key: "nope" } as any }),
      ).rejects.toThrow(/invalid orderBy column/i);
    });
  });

  it("save throws on duplicate (benchmarkId, matchIndex) due to unique constraint", async () => {
    await withTestTx(async (tx) => {
      const { benchmark, sample, arenaMatchRepo } = await seed(tx);

      await arenaMatchRepo.save(
        ArenaMatchCreateSchema.parse({
          benchmarkId: benchmark.id,
          matchIndex: 1,
          sampleId: sample.id,
          matchData: { x: 1 },
        }),
      );

      await expect(
        arenaMatchRepo.save(
          ArenaMatchCreateSchema.parse({
            benchmarkId: benchmark.id,
            matchIndex: 1,
            sampleId: sample.id,
            matchData: { x: 2 },
          }),
        ),
      ).rejects.toThrow();
    });
  });
});
