import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, asc, desc, eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { Conn } from "@/lib/db/core";
import { trials } from "@/lib/db/schema";
import { type FilterOptions, OrderDirection } from "../query-options";

export const TrialSchema = createSelectSchema(trials);
export const TrialCreateSchema = createInsertSchema(trials);
export const TrialUpdateSchema = TrialCreateSchema.partial().extend({
  id: TrialSchema.shape.id,
});
export type TrialModel = InferSelectModel<typeof trials>;
export type TrialCreateModel = InferInsertModel<typeof trials>;
export type TrialUpdateModel = {
  id: TrialModel["id"];
} & Partial<TrialCreateModel>;

export class TrialRepository {
  constructor(private conn: Conn) {}

  async save(input: TrialCreateModel): Promise<TrialModel> {
    const [saved] = await this.conn.insert(trials).values(input).returning();
    if (!saved) throw new Error("failed to save trial");
    return saved;
  }

  async saveAll(inputs: TrialCreateModel[]): Promise<TrialModel[]> {
    if (inputs.length === 0) return [];

    const saved = await this.conn.insert(trials).values(inputs).returning();

    if (saved.length !== inputs.length) {
      throw new Error("failed to save all trials");
    }

    return saved;
  }

  async update(input: TrialUpdateModel): Promise<TrialModel> {
    const { id, ...data } = input;

    if (Object.keys(data).length === 0) {
      throw new Error("no fields to update");
    }

    const [updated] = await this.conn
      .update(trials)
      .set(data)
      .where(eq(trials.id, id))
      .returning();

    if (!updated) throw new Error("trial not found");
    return updated;
  }

  async find(options: { id: TrialModel["id"] }): Promise<TrialModel | null> {
    if ("id" in options) {
      const [row] = await this.conn
        .select()
        .from(trials)
        .where(eq(trials.id, options.id))
        .limit(1);

      return row ?? null;
    }

    throw new Error("invalid unique key");
  }

  async filter(options: FilterOptions<TrialModel> = {}): Promise<TrialModel[]> {
    const where = options.where ?? {};
    const conditions = [];

    for (const [key, value] of Object.entries(where) as [
      keyof TrialModel,
      TrialModel[keyof TrialModel],
    ][]) {
      if (value === undefined) continue;

      const col = trials[key];
      if (!col) throw new Error(`invalid where column: ${String(key)}`);

      conditions.push(eq(col, value));
    }

    let query = this.conn.select().from(trials).$dynamic();

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

  async delete(options: { id: TrialModel["id"] }): Promise<TrialModel> {
    const [deleted] = await this.conn
      .delete(trials)
      .where(eq(trials.id, options.id))
      .returning();

    if (!deleted) throw new Error("trial not found");
    return deleted;
  }
}
