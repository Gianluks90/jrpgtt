export const EVENT_LOG_CONFIG = {
  footer: {
    maxSummaryLength: 180,
    chainSeparator: " -> ",
    emptyMessage: "No events yet.",
  },
  stream: {
    maxEntries: 50,
  },
} as const;
