import type { AnyColumn } from "drizzle-orm";

export const OrderDirection = {
  Asc: "asc",
  Desc: "desc",
} as const;

export type OrderDirection =
  (typeof OrderDirection)[keyof typeof OrderDirection];

export type FilterOptions<T> = {
  where?: Partial<T>;
  orderBy?: {
    key: AnyColumn;
    direction?: OrderDirection;
  };
  limit?: number;
  offset?: number;
};
