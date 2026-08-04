import "server-only";

import { collectSnapshot } from "@/lib/pipeline/collectSnapshot";
import type { CollectorSnapshot, PipelineSlot } from "@/lib/pipeline/types";

export async function runCollector(slot: PipelineSlot): Promise<CollectorSnapshot> {
  return collectSnapshot(slot);
}
