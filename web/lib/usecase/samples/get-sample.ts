import { db } from "@/lib/db/core";
import { SampleRepository } from "@/lib/db/repository/sample-repository";
import { SampleInfoSchema } from "@/lib/db/types/jsonb";

export type GetSampleParams = {
  sampleId: string;
};

export async function getSample(params: GetSampleParams) {
  const { sampleId } = params;
  const sampleRepository = new SampleRepository(db);
  const sample = await sampleRepository.find({ id: sampleId });

  if (!sample) {
    return null;
  }

  const parsedInfo = SampleInfoSchema.parse(sample.info);

  return { ...sample, info: parsedInfo };
}
