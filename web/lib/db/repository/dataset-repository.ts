import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, asc, desc, eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { Conn } from "@/lib/db/core";
import { datasets } from "@/lib/db/schema";
import { type FilterOptions, OrderDirection } from "../query-options";

export const DatasetSchema = createSelectSchema(datasets);
export const DatasetCreateSchema = createInsertSchema(datasets);
export const DatasetUpdateSchema = DatasetCreateSchema.partial().extend({
  id: DatasetSchema.shape.id,
});
export type DatasetModel = InferSelectModel<typeof datasets>;
export type DatasetCreateModel = InferInsertModel<typeof datasets>;
export type DatasetUpdateModel = {
  id: DatasetModel["id"];
} & Partial<DatasetCreateModel>;

export class DatasetRepository {
  constructor(private conn: Conn) {}

  async save(input: DatasetCreateModel): Promise<DatasetModel> {
    const [saved] = await this.conn.insert(datasets).values(input).returning();
    if (!saved) throw new Error("failed to save dataset");
    return saved;
  }

  async saveAll(inputs: DatasetCreateModel[]): Promise<DatasetModel[]> {
    if (inputs.length === 0) return [];

    const saved = await this.conn.insert(datasets).values(inputs).returning();

    if (saved.length !== inputs.length) {
      throw new Error("failed to save all datasets");
    }

    return saved;
  }

  async update(input: DatasetUpdateModel): Promise<DatasetModel> {
    const { id, ...data } = input;

    if (Object.keys(data).length === 0) {
      throw new Error("no fields to update");
    }

    const [updated] = await this.conn
      .update(datasets)
      .set(data)
      .where(eq(datasets.id, id))
      .returning();

    if (!updated) throw new Error("dataset not found");
    return updated;
  }

  async find(options: {
    id: DatasetModel["id"];
  }): Promise<DatasetModel | null> {
    if ("id" in options) {
      const [row] = await this.conn
        .select()
        .from(datasets)
        .where(eq(datasets.id, options.id))
        .limit(1);

      return row ?? null;
    }

    throw new Error("invalid unique key");
  }

  async filter(
    options: FilterOptions<DatasetModel> = {},
  ): Promise<DatasetModel[]> {
    const where = options.where ?? {};
    const conditions = [];

    for (const [key, value] of Object.entries(where) as [
      keyof DatasetModel,
      DatasetModel[keyof DatasetModel],
    ][]) {
      if (value === undefined) continue;

      const col = datasets[key];
      if (!col) throw new Error(`invalid where column: ${String(key)}`);

      conditions.push(eq(col, value));
    }

    let query = this.conn.select().from(datasets).$dynamic();

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

  async delete(options: { id: DatasetModel["id"] }): Promise<DatasetModel> {
    const [deleted] = await this.conn
      .delete(datasets)
      .where(eq(datasets.id, options.id))
      .returning();

    if (!deleted) throw new Error("dataset not found");
    return deleted;
  }
}
