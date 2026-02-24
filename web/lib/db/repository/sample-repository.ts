import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, asc, desc, eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { Conn } from "@/lib/db/core";
import { samples } from "@/lib/db/schema";
import { type FilterOptions, OrderDirection } from "../query-options";

export const SampleSchema = createSelectSchema(samples);
export const SampleCreateSchema = createInsertSchema(samples);
export const SampleUpdateSchema = SampleCreateSchema.partial().extend({
  id: SampleSchema.shape.id,
});
export type SampleModel = InferSelectModel<typeof samples>;
export type SampleCreateModel = InferInsertModel<typeof samples>;
export type SampleUpdateModel = {
  id: SampleModel["id"];
} & Partial<SampleCreateModel>;

export class SampleRepository {
  constructor(private conn: Conn) {}

  async save(input: SampleCreateModel): Promise<SampleModel> {
    const [saved] = await this.conn.insert(samples).values(input).returning();
    if (!saved) throw new Error("failed to save sample");
    return saved;
  }

  async saveAll(inputs: SampleCreateModel[]): Promise<SampleModel[]> {
    if (inputs.length === 0) return [];

    const saved = await this.conn.insert(samples).values(inputs).returning();

    if (saved.length !== inputs.length) {
      throw new Error("failed to save all samples");
    }

    return saved;
  }

  async update(input: SampleUpdateModel): Promise<SampleModel> {
    const { id, ...data } = input;

    if (Object.keys(data).length === 0) {
      throw new Error("no fields to update");
    }

    const [updated] = await this.conn
      .update(samples)
      .set(data)
      .where(eq(samples.id, id))
      .returning();

    if (!updated) throw new Error("sample not found");
    return updated;
  }

  async find(options: { id: SampleModel["id"] }): Promise<SampleModel | null> {
    if ("id" in options) {
      const [row] = await this.conn
        .select()
        .from(samples)
        .where(eq(samples.id, options.id))
        .limit(1);

      return row ?? null;
    }

    throw new Error("invalid unique key");
  }
  async filter(
    options: FilterOptions<SampleModel> = {},
  ): Promise<SampleModel[]> {
    const where = options.where ?? {};
    const conditions = [];

    for (const [key, value] of Object.entries(where) as [
      keyof SampleModel,
      SampleModel[keyof SampleModel],
    ][]) {
      if (value === undefined) continue;

      const col = samples[key];
      if (!col) throw new Error(`invalid where column: ${String(key)}`);

      conditions.push(eq(col, value));
    }

    let query = this.conn.select().from(samples).$dynamic();

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

  async delete(options: { id: SampleModel["id"] }): Promise<SampleModel> {
    const [deleted] = await this.conn
      .delete(samples)
      .where(eq(samples.id, options.id))
      .returning();

    if (!deleted) throw new Error("sample not found");
    return deleted;
  }
}
