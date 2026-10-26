export const managementReadPolicy = {
  pageSize: 100,
  maxPages: 100,
  maxItems: 10_000,
  attempts: 2,
  deadlineMs: 30_000,
} as const;

export const managementFeedbackPolicy = { copyFeedbackMs: 1500 } as const;
