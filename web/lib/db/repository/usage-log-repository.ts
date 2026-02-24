import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, asc, desc, eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { Conn } from "@/lib/db/core";
import { usageLogs } from "@/lib/db/schema";
import { type FilterOptions, OrderDirection } from "../query-options";

export const UsageLogSchema = createSelectSchema(usageLogs);
export const UsageLogCreateSchema = createInsertSchema(usageLogs);
export const UsageLogUpdateSchema = UsageLogCreateSchema.partial().extend({
  id: UsageLogSchema.shape.id,
});
export type UsageLogModel = InferSelectModel<typeof usageLogs>;
export type UsageLogCreateModel = InferInsertModel<typeof usageLogs>;
export type UsageLogUpdateModel = {
  id: UsageLogModel["id"];
} & Partial<UsageLogCreateModel>;

export class UsageLogRepository {
  constructor(private conn: Conn) {}

  async save(input: UsageLogCreateModel): Promise<UsageLogModel> {
    const [saved] = await this.conn.insert(usageLogs).values(input).returning();
    if (!saved) throw new Error("failed to save usage log");
    return saved;
  }

  async saveAll(inputs: UsageLogCreateModel[]): Promise<UsageLogModel[]> {
    if (inputs.length === 0) return [];

    const saved = await this.conn.insert(usageLogs).values(inputs).returning();

    if (saved.length !== inputs.length) {
      throw new Error("failed to save all usage logs");
    }

    return saved;
  }

  async update(input: UsageLogUpdateModel): Promise<UsageLogModel> {
    const { id, ...data } = input;

    if (Object.keys(data).length === 0) {
      throw new Error("no fields to update");
    }

    const [updated] = await this.conn
      .update(usageLogs)
      .set(data)
      .where(eq(usageLogs.id, id))
      .returning();

    if (!updated) throw new Error("usage log not found");
    return updated;
  }

  async find(options: {
    id: UsageLogModel["id"];
  }): Promise<UsageLogModel | null> {
    if ("id" in options) {
      const [row] = await this.conn
        .select()
        .from(usageLogs)
        .where(eq(usageLogs.id, options.id))
        .limit(1);

      return row ?? null;
    }

    throw new Error("invalid unique key");
  }

  async filter(
    options: FilterOptions<UsageLogModel> = {},
  ): Promise<UsageLogModel[]> {
    const where = options.where ?? {};
    const conditions = [];

    for (const [key, value] of Object.entries(where) as [
      keyof UsageLogModel,
      UsageLogModel[keyof UsageLogModel],
    ][]) {
      if (value === undefined) continue;

      const col = usageLogs[key];
      if (!col) throw new Error(`invalid where column: ${String(key)}`);

      conditions.push(eq(col, value));
    }

    let query = this.conn.select().from(usageLogs).$dynamic();

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

  async delete(options: { id: UsageLogModel["id"] }): Promise<UsageLogModel> {
    const [deleted] = await this.conn
      .delete(usageLogs)
      .where(eq(usageLogs.id, options.id))
      .returning();

    if (!deleted) throw new Error("usage log not found");
    return deleted;
  }
}
