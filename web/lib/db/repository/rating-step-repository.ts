import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, asc, desc, eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { Conn } from "@/lib/db/core";
import { ratingSteps } from "@/lib/db/schema";
import { type FilterOptions, OrderDirection } from "../query-options";

export const RatingStepSchema = createSelectSchema(ratingSteps);
export const RatingStepCreateSchema = createInsertSchema(ratingSteps);
export const RatingStepUpdateSchema = RatingStepCreateSchema.partial().extend({
  id: RatingStepSchema.shape.id,
});
export type RatingStepModel = InferSelectModel<typeof ratingSteps>;
export type RatingStepCreateModel = InferInsertModel<typeof ratingSteps>;
export type RatingStepUpdateModel = {
  id: RatingStepModel["id"];
} & Partial<RatingStepCreateModel>;

export class RatingStepRepository {
  constructor(private conn: Conn) {}

  async save(input: RatingStepCreateModel): Promise<RatingStepModel> {
    const [saved] = await this.conn
      .insert(ratingSteps)
      .values(input)
      .returning();
    if (!saved) throw new Error("failed to save rating step");
    return saved;
  }

  async saveAll(inputs: RatingStepCreateModel[]): Promise<RatingStepModel[]> {
    if (inputs.length === 0) return [];

    const saved = await this.conn
      .insert(ratingSteps)
      .values(inputs)
      .returning();

    if (saved.length !== inputs.length) {
      throw new Error("failed to save all rating steps");
    }

    return saved;
  }

  async update(input: RatingStepUpdateModel): Promise<RatingStepModel> {
    const { id, ...data } = input;

    if (Object.keys(data).length === 0) {
      throw new Error("no fields to update");
    }

    const [updated] = await this.conn
      .update(ratingSteps)
      .set(data)
      .where(eq(ratingSteps.id, id))
      .returning();

    if (!updated) throw new Error("rating step not found");
    return updated;
  }

  async find(options: {
    id: RatingStepModel["id"];
  }): Promise<RatingStepModel | null> {
    if ("id" in options) {
      const [row] = await this.conn
        .select()
        .from(ratingSteps)
        .where(eq(ratingSteps.id, options.id))
        .limit(1);

      return row ?? null;
    }

    throw new Error("invalid unique key");
  }
  async filter(
    options: FilterOptions<RatingStepModel> = {},
  ): Promise<RatingStepModel[]> {
    const where = options.where ?? {};
    const conditions = [];

    for (const [key, value] of Object.entries(where) as [
      keyof RatingStepModel,
      RatingStepModel[keyof RatingStepModel],
    ][]) {
      if (value === undefined) continue;

      const col = ratingSteps[key];
      if (!col) throw new Error(`invalid where column: ${String(key)}`);

      conditions.push(eq(col, value));
    }

    let query = this.conn.select().from(ratingSteps).$dynamic();

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

  async delete(options: {
    id: RatingStepModel["id"];
  }): Promise<RatingStepModel> {
    const [deleted] = await this.conn
      .delete(ratingSteps)
      .where(eq(ratingSteps.id, options.id))
      .returning();

    if (!deleted) throw new Error("rating step not found");
    return deleted;
  }
}
