import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { and, asc, desc, eq } from "drizzle-orm";
import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import type { Conn } from "@/lib/db/core";
import { projects } from "@/lib/db/schema";
import { type FilterOptions, OrderDirection } from "../query-options";

export const ProjectSchema = createSelectSchema(projects);
export const ProjectCreateSchema = createInsertSchema(projects);
export const ProjectUpdateSchema = ProjectCreateSchema.partial().extend({
  id: ProjectSchema.shape.id,
});
export type ProjectModel = InferSelectModel<typeof projects>;
export type ProjectCreateModel = InferInsertModel<typeof projects>;
export type ProjectUpdateModel = {
  id: ProjectModel["id"];
} & Partial<ProjectCreateModel>;

export class ProjectRepository {
  constructor(private conn: Conn) {}

  async save(input: ProjectCreateModel): Promise<ProjectModel> {
    const [saved] = await this.conn.insert(projects).values(input).returning();
    if (!saved) throw new Error("failed to save project");
    return saved;
  }

  async saveAll(inputs: ProjectCreateModel[]): Promise<ProjectModel[]> {
    if (inputs.length === 0) return [];

    const saved = await this.conn.insert(projects).values(inputs).returning();

    if (saved.length !== inputs.length) {
      throw new Error("failed to save all projects");
    }

    return saved;
  }

  async update(input: ProjectUpdateModel): Promise<ProjectModel> {
    const { id, ...data } = input;

    if (Object.keys(data).length === 0) {
      throw new Error("no fields to update");
    }

    const [updated] = await this.conn
      .update(projects)
      .set(data)
      .where(eq(projects.id, id))
      .returning();

    if (!updated) throw new Error("project not found");
    return updated;
  }

  async find(options: {
    id: ProjectModel["id"];
  }): Promise<ProjectModel | null> {
    const [row] = await this.conn
      .select()
      .from(projects)
      .where(eq(projects.id, options.id))
      .limit(1);

    return row ?? null;
  }

  async filter(
    options: FilterOptions<ProjectModel> = {},
  ): Promise<ProjectModel[]> {
    const where = options.where ?? {};
    const conditions = [];

    for (const [key, value] of Object.entries(where) as [
      keyof ProjectModel,
      ProjectModel[keyof ProjectModel],
    ][]) {
      if (value === undefined) continue;

      const col = projects[key];
      if (!col) throw new Error(`invalid where column: ${String(key)}`);

      conditions.push(eq(col, value));
    }

    let query = this.conn.select().from(projects).$dynamic();

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

  async delete(options: { id: ProjectModel["id"] }): Promise<ProjectModel> {
    const [deleted] = await this.conn
      .delete(projects)
      .where(eq(projects.id, options.id))
      .returning();

    if (!deleted) throw new Error("project not found");
    return deleted;
  }
}
