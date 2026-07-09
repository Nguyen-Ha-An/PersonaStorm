import type { DriveStep } from "driver.js";

/**
 * Guided-tour steps for the verdict-first report (used on the public demo and,
 * reusably, anywhere ReportView renders). Anchored to stable data-tour / id
 * hooks so the tour is decoupled from component internals.
 */
export const reportTourSteps: DriveStep[] = [
  {
    element: '[data-tour="verdict-banner"]',
    popover: {
      title: "The verdict",
      description:
        "One decisive call — strong, promising, or weak — with an honest caveat pill when confidence is low.",
    },
  },
  {
    element: '[data-tour="top-actions"]',
    popover: {
      title: "Do these first",
      description:
        "The three highest-impact fixes, each backed by evidence and linked to the matching detail below.",
    },
  },
  {
    element: "#full-diagnostics",
    popover: {
      title: "The full breakdown",
      description:
        "Every panel of depth — criteria, segments, pricing, objections — sits below, for when you want it.",
    },
  },
];
