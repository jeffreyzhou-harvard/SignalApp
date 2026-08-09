import { describe, it, expect } from "vitest";
import type { DeployPrediction, PostMetrics } from "../types";
import {
  buildComparisons,
  buildSummary,
  deltaVsPrevious,
  deltaVsRollingAvg,
  postEngagementRate,
  predictedVsActual,
  rollingAverageRate,
} from "./compare";

function metrics(partial: Partial<PostMetrics> = {}): PostMetrics {
  return { likes: 0, reposts: 0, replies: 0, views: 0, bookmarks: 0, ...partial };
}

function prediction(partial: Partial<DeployPrediction> = {}): DeployPrediction {
  return {
    winner: "A",
    predictedLiftPct: 10,
    confidencePct: 80,
    driver: "hook",
    predictedEngagementRate: 5,
    provider: "sim",
    agentCount: 100,
    capturedAt: "2026-01-01T00:00:00Z",
    ...partial,
  };
}

describe("postEngagementRate", () => {
  it("computes (likes+reposts+replies+bookmarks)/views*100", () => {
    // (10+5+3+2)/1000*100 = 2
    const m = metrics({ likes: 10, reposts: 5, replies: 3, bookmarks: 2, views: 1000 });
    expect(postEngagementRate(m)).toBe(2);
  });

  it("returns 0 when views is 0", () => {
    expect(postEngagementRate(metrics({ likes: 10, views: 0 }))).toBe(0);
  });

  it("ignores a cached engagementRate and computes fresh", () => {
    const m = metrics({ likes: 20, views: 1000, engagementRate: 99 });
    expect(postEngagementRate(m)).toBe(2);
  });
});

describe("rollingAverageRate", () => {
  it("returns null for an empty array", () => {
    expect(rollingAverageRate([])).toBeNull();
  });

  it("computes the arithmetic mean", () => {
    expect(rollingAverageRate([1, 2, 3, 4])).toBe(2.5);
  });
});

describe("deltaVsRollingAvg", () => {
  it("returns null when otherRates is empty", () => {
    expect(deltaVsRollingAvg(5, [])).toBeNull();
  });

  it("returns null when the average is 0", () => {
    expect(deltaVsRollingAvg(5, [0, 0])).toBeNull();
  });

  it("computes a positive delta", () => {
    // avg = 2, (3-2)/2*100 = 50
    expect(deltaVsRollingAvg(3, [1, 3])).toBe(50);
  });

  it("computes a negative delta", () => {
    // avg = 4, (2-4)/4*100 = -50
    expect(deltaVsRollingAvg(2, [4, 4])).toBe(-50);
  });
});

describe("deltaVsPrevious", () => {
  it("returns null when prevRate is null", () => {
    expect(deltaVsPrevious(5, null)).toBeNull();
  });

  it("returns null when prevRate is 0", () => {
    expect(deltaVsPrevious(5, 0)).toBeNull();
  });

  it("computes a positive delta", () => {
    // (6-4)/4*100 = 50
    expect(deltaVsPrevious(6, 4)).toBe(50);
  });

  it("computes a negative delta", () => {
    // (2-4)/4*100 = -50
    expect(deltaVsPrevious(2, 4)).toBe(-50);
  });
});

describe("predictedVsActual", () => {
  it("returns null when prediction is null", () => {
    expect(predictedVsActual(null, 5)).toBeNull();
  });

  it("returns null when prediction is undefined", () => {
    expect(predictedVsActual(undefined, 5)).toBeNull();
  });

  it("returns deltaPct 0 when predicted rate is 0", () => {
    const result = predictedVsActual(prediction({ predictedEngagementRate: 0 }), 5);
    expect(result).toEqual({ predictedRate: 0, actualRate: 5, deltaPct: 0 });
  });

  it("computes the delta for a normal prediction", () => {
    // predicted 5, actual 6 -> (6-5)/5*100 = 20
    const result = predictedVsActual(prediction({ predictedEngagementRate: 5 }), 6);
    expect(result).toEqual({ predictedRate: 5, actualRate: 6, deltaPct: 20 });
  });
});

describe("buildComparisons", () => {
  it("returns all-null (and no predicted) when metrics is null", () => {
    const result = buildComparisons({
      metrics: null,
      prediction: prediction(),
      otherRates: [1, 2],
      prevRate: 3,
    });
    expect(result).toEqual({ engagementRate: null, vsRollingAvgPct: null, vsPreviousPct: null });
    expect(result).not.toHaveProperty("predicted");
  });

  it("computes a full bundle without a prediction", () => {
    // rate = (20)/1000*100 = 2; otherRates avg = 1 -> (2-1)/1*100 = 100; prev 4 -> (2-4)/4*100 = -50
    const result = buildComparisons({
      metrics: metrics({ likes: 20, views: 1000 }),
      otherRates: [1, 1],
      prevRate: 4,
    });
    expect(result).toEqual({
      engagementRate: 2,
      vsRollingAvgPct: 100,
      vsPreviousPct: -50,
    });
    expect(result).not.toHaveProperty("predicted");
  });

  it("includes predicted when a prediction is present", () => {
    // rate = 2; predicted 4 -> (2-4)/4*100 = -50
    const result = buildComparisons({
      metrics: metrics({ likes: 20, views: 1000 }),
      prediction: prediction({ predictedEngagementRate: 4 }),
      otherRates: [],
      prevRate: null,
    });
    expect(result.engagementRate).toBe(2);
    expect(result.vsRollingAvgPct).toBeNull();
    expect(result.vsPreviousPct).toBeNull();
    expect(result.predicted).toEqual({ predictedRate: 4, actualRate: 2, deltaPct: -50 });
  });
});

describe("buildSummary", () => {
  it("handles an empty array", () => {
    expect(buildSummary([])).toEqual({
      totalImpressions: 0,
      avgEngagementRate: null,
      bestDeployId: null,
      vsPreviousPeriodPct: null,
    });
  });

  it("handles all-null metrics", () => {
    expect(
      buildSummary([
        { id: "a", metrics: null },
        { id: "b", metrics: null },
      ]),
    ).toEqual({
      totalImpressions: 0,
      avgEngagementRate: null,
      bestDeployId: null,
      vsPreviousPeriodPct: null,
    });
  });

  it("computes impressions, avg, and best across mixed deploys", () => {
    // a: rate 2 (views 1000), b: null, c: rate 4 (views 500)
    const result = buildSummary([
      { id: "a", metrics: metrics({ likes: 20, views: 1000 }) },
      { id: "b", metrics: null },
      { id: "c", metrics: metrics({ likes: 20, views: 500 }) },
    ]);
    expect(result.totalImpressions).toBe(1500);
    expect(result.avgEngagementRate).toBe(3); // (2 + 4) / 2
    expect(result.bestDeployId).toBe("c"); // rate 4 > rate 2
  });

  it("picks the first deploy on a tie for best", () => {
    const result = buildSummary([
      { id: "a", metrics: metrics({ likes: 20, views: 1000 }) }, // rate 2
      { id: "b", metrics: metrics({ likes: 10, views: 500 }) }, // rate 2
    ]);
    expect(result.bestDeployId).toBe("a");
  });

  it("computes vsPreviousPeriodPct across recent/older halves", () => {
    // 4 deploys newest-first: recent = [a,b], older = [c,d]
    // recent rates: 4, 4 -> avg 4; older rates: 2, 2 -> avg 2; (4-2)/2*100 = 100
    const result = buildSummary([
      { id: "a", metrics: metrics({ likes: 40, views: 1000 }) },
      { id: "b", metrics: metrics({ likes: 20, views: 500 }) },
      { id: "c", metrics: metrics({ likes: 20, views: 1000 }) },
      { id: "d", metrics: metrics({ likes: 10, views: 500 }) },
    ]);
    expect(result.vsPreviousPeriodPct).toBe(100);
  });

  it("returns null vsPreviousPeriodPct when the older half has no metrics", () => {
    // recent = [a,b] have metrics; older = [c,d] have none
    const result = buildSummary([
      { id: "a", metrics: metrics({ likes: 40, views: 1000 }) },
      { id: "b", metrics: metrics({ likes: 20, views: 500 }) },
      { id: "c", metrics: null },
      { id: "d", metrics: null },
    ]);
    expect(result.vsPreviousPeriodPct).toBeNull();
  });

  it("returns null vsPreviousPeriodPct when the older avg is 0", () => {
    // older half rate is 0 (no interactions) -> div-by-zero guard
    const result = buildSummary([
      { id: "a", metrics: metrics({ likes: 40, views: 1000 }) },
      { id: "b", metrics: metrics({ likes: 20, views: 500 }) },
      { id: "c", metrics: metrics({ likes: 0, views: 1000 }) },
      { id: "d", metrics: metrics({ likes: 0, views: 500 }) },
    ]);
    expect(result.vsPreviousPeriodPct).toBeNull();
  });
});
