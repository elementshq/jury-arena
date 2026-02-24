import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, asc, desc, eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { Conn } from "@/lib/db/core";
import { benchmarks } from "@/lib/db/schema";
import { type FilterOptions, OrderDirection } from "../query-options";

export const BenchmarkSchema = createSelectSchema(benchmarks);
export const BenchmarkCreateSchema = createInsertSchema(benchmarks);
export const BenchmarkUpdateSchema = BenchmarkCreateSchema.partial().extend({
  id: BenchmarkSchema.shape.id,
});
export type BenchmarkModel = InferSelectModel<typeof benchmarks>;
export type BenchmarkCreateModel = InferInsertModel<typeof benchmarks>;
export type BenchmarkUpdateModel = {
  id: BenchmarkModel["id"];
} & Partial<BenchmarkCreateModel>;

export class BenchmarkRepository {
  constructor(private conn: Conn) {}

  async save(input: BenchmarkCreateModel): Promise<BenchmarkModel> {
    const [saved] = await this.conn
      .insert(benchmarks)
      .values(input)
      .returning();
    if (!saved) throw new Error("failed to save benchmark");
    return saved;
  }

  async saveAll(inputs: BenchmarkCreateModel[]): Promise<BenchmarkModel[]> {
    if (inputs.length === 0) return [];

    const saved = await this.conn.insert(benchmarks).values(inputs).returning();

    if (saved.length !== inputs.length) {
      throw new Error("failed to save all benchmarks");
    }

    return saved;
  }

  async update(input: BenchmarkUpdateModel): Promise<BenchmarkModel> {
    const { id, ...data } = input;

    if (Object.keys(data).length === 0) {
      throw new Error("no fields to update");
    }

    const [updated] = await this.conn
      .update(benchmarks)
      .set(data)
      .where(eq(benchmarks.id, id))
      .returning();

    if (!updated) throw new Error("benchmark not found");
    return updated;
  }

  async find(options: {
    id: BenchmarkModel["id"];
  }): Promise<BenchmarkModel | null> {
    if ("id" in options) {
      const [row] = await this.conn
        .select()
        .from(benchmarks)
        .where(eq(benchmarks.id, options.id))
        .limit(1);

      return row ?? null;
    }

    throw new Error("invalid unique key");
  }

  async filter(
    options: FilterOptions<BenchmarkModel> = {},
  ): Promise<BenchmarkModel[]> {
    const where = options.where ?? {};
    const conditions = [];

    for (const [key, value] of Object.entries(where) as [
      keyof BenchmarkModel,
      BenchmarkModel[keyof BenchmarkModel],
    ][]) {
      if (value === undefined) continue;

      const col = benchmarks[key];
      if (!col) throw new Error(`invalid where column: ${String(key)}`);

      conditions.push(eq(col, value));
    }

    let query = this.conn.select().from(benchmarks).$dynamic();

    if (conditions.length) {
      query = query.where(and(...conditions));
    }

    if (options.orderBy) {
      const { key, direction = OrderDirection.Desc } = options.orderBy;

      query = query.orderBy(
        direction === OrderDirection.Asc ? asc(key) : desc(key),
      );
    }

    if (options.limit !== undefined) query = query.limit(options.limit);
    if (options.offset !== undefined) query = query.offset(options.offset);

    return query;
  }

  async delete(options: { id: BenchmarkModel["id"] }): Promise<BenchmarkModel> {
    const [deleted] = await this.conn
      .delete(benchmarks)
      .where(eq(benchmarks.id, options.id))
      .returning();

    if (!deleted) throw new Error("benchmark not found");
    return deleted;
  }
}
