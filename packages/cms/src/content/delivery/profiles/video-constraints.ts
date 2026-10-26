import { z } from 'zod';
import { validH3Constraints } from './media-requests.ts';
interface FlowConstraints {
  flowKey: string;
  resolutions?: readonly string[] | undefined;
  durations?: readonly number[] | undefined;
  aspectRatios?: readonly string[] | undefined;
  promptMaxLength?: number | undefined;
}
const seedanceFlows = z.enum(['video.seedance-text', 'video.seedance-25-text']);
const resolutions = ['480p', '720p', '1080p'];
const ratios = {
  'video.seedance-text': ['1:1', '4:3', '3:4', '16:9', '9:16', '9:21'],
  'video.seedance-25-text': ['1:1', '4:3', '3:4', '16:9', '9:16', '21:9'],
};
export function validFlowConstraints(input: FlowConstraints) {
  const maximum = input.flowKey === 'video.seedance-25-text' ? 20480 : 10000;
  if ((input.promptMaxLength ?? 0) > maximum) return false;
  const flow = seedanceFlows.safeParse(input.flowKey);
  if (!flow.success) return validH3Constraints(input);
  return (
    (input.resolutions ?? []).every((value) => resolutions.includes(value)) &&
    (input.durations ?? []).every((value) => value === 5 || value === 10) &&
    (input.aspectRatios ?? []).every((value) => ratios[flow.data].includes(value))
  );
}
