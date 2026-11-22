// Fixed demo deck: exercises all four layouts with zero Anna quota.
// Used by the "Load mock deck" button and by the layout/PPTX tests.

import { createDeck } from "./ir.js";

export function mockDeck() {
  return createDeck({
    title: "Small Teams Ship Faster",
    subtitle: "A short argument in five slides",
    slides: [
      {
        layout: "cover",
        title: "Small Teams Ship Faster",
        subtitle: "Fewer handoffs. Tighter feedback loops. Clearer ownership.",
      },
      {
        layout: "bullets",
        title: "Why small teams win",
        bullets: [
          "Every handoff adds latency and quietly loses context.",
          "Short feedback loops turn guesses into evidence.",
          "Clear ownership removes decision gridlock.",
          "A small surface area keeps quality visible.",
        ],
      },
      {
        layout: "compare",
        title: "Two operating models",
        left: {
          heading: "Large team",
          points: [
            "Layered approvals before any release",
            "Quarterly release trains",
            "Ownership diffuses across functions",
            "Feedback arrives weeks after the decision",
          ],
        },
        right: {
          heading: "Small team",
          points: [
            "Direct decisions with clear owners",
            "Daily shipping to real users",
            "One owner per outcome",
            "Feedback arrives the same day",
          ],
        },
      },
      {
        layout: "process",
        title: "The weekly loop",
        steps: [
          { label: "Pick", detail: "Choose one outcome for the week." },
          { label: "Build", detail: "Ship the smallest usable slice." },
          { label: "Ship", detail: "Release to real users, not a demo." },
          { label: "Learn", detail: "Keep only what the evidence supports." },
        ],
      },
      {
        layout: "bullets",
        title: "What to change on Monday",
        bullets: [
          "Name one owner for every outcome.",
          "Cut the approval chain to a single reviewer.",
          "Ship something real every week.",
          "Review evidence, not opinions.",
        ],
      },
    ],
  });
}
