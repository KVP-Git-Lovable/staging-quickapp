export type InsightPriority = "high" | "medium" | "low";

export interface AiInsight {
  id: string;
  title: string;
  priority: InsightPriority;
  /** Short markdown-ish explanation shown on the card. */
  explanation: string;
  /** Business impact statement. */
  impact: string;
  /** 0-100 model confidence. */
  confidence: number;
  /** Extra bullet points revealed when the card is expanded. */
  details: string[];
  /** Optional: set when a backend supplies streaming narration. */
  streaming?: boolean;
  /** Optional: supporting data references from deterministic SQL. */
  citations?: { label: string; href?: string }[];
  /** Optional: where "Take action" should navigate once wired. */
  actionHref?: string;
  actionLabel?: string;
}

export const insightSeeds: AiInsight[] = [
  {
    id: "churn-risk",
    title: "Churn Risk Retailers",
    priority: "high",
    explanation: "**12 retailers** have placed no confirmed order across their last 3 visits.",
    impact: "Approx. 8% of monthly secondary sales at risk if not re-engaged this cycle.",
    confidence: 88,
    details: [
      "Concentrated in 3 beats with the longest visit gaps.",
      "9 of 12 previously ordered every fortnight.",
      "Suggested play: a targeted scheme on their top-2 historical SKUs.",
    ],
    actionLabel: "View retailers",
  },
  {
    id: "low-productivity",
    title: "Low Productivity Retailers",
    priority: "high",
    explanation: "Retailers visited frequently but converting below **30%** of visits into orders.",
    impact: "Field time is being spent where yield is lowest.",
    confidence: 82,
    details: [
      "Average 6 visits per month, 1.6 orders.",
      "Order value per visit is ~40% below beat average.",
      "Consider reducing visit frequency or changing the pitch.",
    ],
    actionLabel: "Rebalance beat",
  },
  {
    id: "long-visits",
    title: "Long Visit Duration",
    priority: "medium",
    explanation: "Visits where check-out minus check-in exceeds the beat median by **2x**.",
    impact: "Longer visits are not translating into higher order value.",
    confidence: 76,
    details: [
      "Top outliers average 38 minutes against a 14-minute median.",
      "No correlation with order size in the last 60 days.",
      "Worth a coaching conversation with the rep.",
    ],
    actionLabel: "Review visits",
  },
  {
    id: "outstanding-collections",
    title: "Outstanding Collections",
    priority: "high",
    explanation: "Pending balances ageing beyond agreed credit terms.",
    impact: "Working capital tied up in overdue retailer balances.",
    confidence: 91,
    details: [
      "Largest exposure sits with a handful of high-volume retailers.",
      "Ageing buckets: 0-30, 31-60, 60+ days.",
      "Prompt reps to collect during the next scheduled visit.",
    ],
    actionLabel: "Open collections",
  },
  {
    id: "missed-visit-targets",
    title: "Missed Visit Targets",
    priority: "medium",
    explanation: "Reps tracking behind their planned beat coverage for the month.",
    impact: "Coverage gaps typically precede order-value decline in the next cycle.",
    confidence: 79,
    details: [
      "Shortfall is concentrated in the last 10 working days.",
      "Some planned beats were never started.",
      "Re-plan the remaining days to recover coverage.",
    ],
    actionLabel: "Open beat planner",
  },
  {
    id: "beat-optimisation",
    title: "Beat Optimisation",
    priority: "medium",
    explanation: "Route sequences with avoidable travel between consecutive retailers.",
    impact: "Reclaimed travel time can fund 1-2 extra visits per day.",
    confidence: 72,
    details: [
      "Detected back-and-forth patterns in GPS traces.",
      "Clustering retailers by pincode reduces distance.",
      "Apply the optimised order to the next beat plan.",
    ],
    actionLabel: "Optimise route",
  },
  {
    id: "upsell-ready",
    title: "Upsell-Ready Retailers",
    priority: "medium",
    explanation: "Consistent orderers who have never bought your higher-margin range.",
    impact: "Straightforward margin upside with no new-account acquisition cost.",
    confidence: 84,
    details: [
      "Ordering reliably for 6+ months.",
      "Zero lines from the premium category.",
      "Pair with a trial-pack scheme for first purchase.",
    ],
    actionLabel: "Build target list",
  },
  {
    id: "declining-order-values",
    title: "Declining Order Values",
    priority: "high",
    explanation: "Retailers whose average order value has fallen for **3 consecutive months**.",
    impact: "Early signal of competitor substitution or stock issues.",
    confidence: 80,
    details: [
      "Decline is steepest in two product categories.",
      "Visit frequency has stayed flat, so it is not a coverage issue.",
      "Capture competitor pricing on the next visit.",
    ],
    actionLabel: "Investigate",
  },
  {
    id: "new-product-opportunities",
    title: "New Product Opportunities",
    priority: "low",
    explanation: "Recently launched SKUs with strong uptake in comparable retailers.",
    impact: "Faster launch penetration in look-alike outlets.",
    confidence: 68,
    details: [
      "Look-alikes matched on category mix and monthly volume.",
      "Early adopters are reordering within 3 weeks.",
      "Push to the matched list before the next cycle.",
    ],
    actionLabel: "See matches",
  },
  {
    id: "seasonal-opportunities",
    title: "Seasonal Opportunities",
    priority: "low",
    explanation: "Categories that spiked in the same period last year.",
    impact: "Pre-stocking ahead of the curve protects against stock-outs.",
    confidence: 65,
    details: [
      "Based on the last two years of order history.",
      "Highlights both the category and the peak fortnight.",
      "Align distributor stock ahead of the window.",
    ],
    actionLabel: "Plan stock",
  },
];
