import { db } from "@/lib/db/core";
import {
  type BenchmarkCreateModel,
  type BenchmarkModel,
  BenchmarkRepository,
} from "@/lib/db/repository/benchmark-repository";

export async function createBenchmark(
  input: BenchmarkCreateModel,
): Promise<{ benchmark: BenchmarkModel }> {
  const benchmarkRepository = new BenchmarkRepository(db);
  const benchmark = await benchmarkRepository.save(input);

  return { benchmark };
}
