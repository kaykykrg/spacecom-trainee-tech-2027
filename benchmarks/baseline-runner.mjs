import { runDetector } from './baseline-writer.mjs';
import { detectRecords } from '../src/sweep-detector.mjs';
export async function runOptimized(input, output, { profile = false } = {}) {
  const metrics = profile ? { records:0,bytesRead:0,groups:0,maxGroup:0,pairs:0,haversine:0,latitudeChecks:0,parsingMs:0,detectionMs:0,writingMs:0,byType:{generico:0,faccao:0,protetiva:0} } : undefined;
  const started=performance.now();
  const result=await runDetector(input,output,detectRecords,metrics);
  const totalMs=performance.now()-started;
  return { ...result, ...(metrics??{}),totalMs,peakRssKiB:process.resourceUsage().maxRSS,
    ...(metrics ? { ingestionAndOtherMs:totalMs-metrics.parsingMs-metrics.detectionMs-metrics.writingMs } : {}) };
}
