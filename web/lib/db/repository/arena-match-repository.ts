import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, asc, desc, eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { Conn } from "@/lib/db/core";
import { arenaMatches } from "@/lib/db/schema";
import { type FilterOptions, OrderDirection } from "../query-options";

export const ArenaMatchSchema = createSelectSchema(arenaMatches);
export const ArenaMatchCreateSchema = createInsertSchema(arenaMatches);
export const ArenaMatchUpdateSchema = ArenaMatchCreateSchema.partial().extend({
  id: ArenaMatchSchema.shape.id,
});
export type ArenaMatchModel = InferSelectModel<typeof arenaMatches>;
export type ArenaMatchCreateModel = InferInsertModel<typeof arenaMatches>;
export type ArenaMatchUpdateModel = {
  id: ArenaMatchModel["id"];
} & Partial<ArenaMatchCreateModel>;

export class ArenaMatchRepository {
  constructor(private conn: Conn) {}

  async save(input: ArenaMatchCreateModel): Promise<ArenaMatchModel> {
    const [saved] = await this.conn
      .insert(arenaMatches)
      .values(input)
      .returning();
    if (!saved) throw new Error("failed to save arena match");
    return saved;
  }

  async saveAll(inputs: ArenaMatchCreateModel[]): Promise<ArenaMatchModel[]> {
    if (inputs.length === 0) return [];

    const saved = await this.conn
      .insert(arenaMatches)
      .values(inputs)
      .returning();

    if (saved.length !== inputs.length) {
      throw new Error("failed to save all arena matches");
    }

    return saved;
  }

  async update(input: ArenaMatchUpdateModel): Promise<ArenaMatchModel> {
    const { id, ...data } = input;

    if (Object.keys(data).length === 0) {
      throw new Error("no fields to update");
    }

    const [updated] = await this.conn
      .update(arenaMatches)
      .set(data)
      .where(eq(arenaMatches.id, id))
      .returning();

    if (!updated) throw new Error("arena match not found");
    return updated;
  }

  async find(options: {
    id: ArenaMatchModel["id"];
  }): Promise<ArenaMatchModel | null> {
    if ("id" in options) {
      const [row] = await this.conn
        .select()
        .from(arenaMatches)
        .where(eq(arenaMatches.id, options.id))
        .limit(1);

      return row ?? null;
    }

    throw new Error("invalid unique key");
  }

  async filter(
    options: FilterOptions<ArenaMatchModel> = {},
  ): Promise<ArenaMatchModel[]> {
    const where = options.where ?? {};
    const conditions = [];

    for (const [key, value] of Object.entries(where) as [
      keyof ArenaMatchModel,
      ArenaMatchModel[keyof ArenaMatchModel],
    ][]) {
      if (value === undefined) continue;

      const col = arenaMatches[key];
      if (!col) throw new Error(`invalid where column: ${String(key)}`);

      conditions.push(eq(col, value));
    }

    let query = this.conn.select().from(arenaMatches).$dynamic();

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
    id: ArenaMatchModel["id"];
  }): Promise<ArenaMatchModel> {
    const [deleted] = await this.conn
      .delete(arenaMatches)
      .where(eq(arenaMatches.id, options.id))
      .returning();

    if (!deleted) throw new Error("arena match not found");
    return deleted;
  }
}
