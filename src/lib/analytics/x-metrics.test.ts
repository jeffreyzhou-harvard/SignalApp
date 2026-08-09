import { describe, it, expect, vi } from "vitest";
import { mapTweetToMetrics, fetchMetrics } from "./x-metrics";

function jsonResponse(data: unknown) {
  return {
    ok: true,
    status: 200,
    statusText: "OK",
    json: async () => data,
    text: async () => JSON.stringify(data),
  };
}

describe("mapTweetToMetrics", () => {
  it("maps a public-only tweet, leaves owner-only fields undefined", () => {
    const tweet = {
      id: "1",
      public_metrics: {
        like_count: 10,
        retweet_count: 3,
        quote_count: 2,
        reply_count: 4,
        impression_count: 1000,
        bookmark_count: 5,
      },
    };

    const m = mapTweetToMetrics(tweet);

    expect(m.likes).toBe(10);
    expect(m.reposts).toBe(5); // retweet + quote
    expect(m.replies).toBe(4);
    expect(m.views).toBe(1000);
    expect(m.bookmarks).toBe(5);
    expect(m.linkClicks).toBeUndefined();
    expect(m.profileClicks).toBeUndefined();
    expect(m.engagements).toBeUndefined();
    // (10 + 5 + 4 + 5) / 1000 * 100 = 2.4
    expect(m.engagementRate).toBeCloseTo(2.4);
  });

  it("populates owner-only fields and prefers non_public impressions", () => {
    const tweet = {
      id: "2",
      public_metrics: {
        like_count: 20,
        retweet_count: 1,
        quote_count: 1,
        reply_count: 2,
        impression_count: 500,
        bookmark_count: 3,
      },
      non_public_metrics: {
        impression_count: 2000,
        url_link_clicks: 15,
        user_profile_clicks: 8,
        engagements: 50,
      },
    };

    const m = mapTweetToMetrics(tweet);

    expect(m.views).toBe(2000); // prefers non_public impression_count
    expect(m.linkClicks).toBe(15);
    expect(m.profileClicks).toBe(8);
    expect(m.engagements).toBe(50);
    // (20 + 2 + 2 + 3) / 2000 * 100 = 1.35
    expect(m.engagementRate).toBeCloseTo(1.35);
  });

  it("falls back to public impressions when non_public impression_count is 0", () => {
    const tweet = {
      id: "3",
      public_metrics: { impression_count: 800 },
      non_public_metrics: { impression_count: 0 },
    };

    const m = mapTweetToMetrics(tweet);
    expect(m.views).toBe(800);
  });

  it("returns engagementRate 0 when views are 0", () => {
    const tweet = {
      id: "4",
      public_metrics: {
        like_count: 5,
        retweet_count: 1,
        reply_count: 1,
        impression_count: 0,
        bookmark_count: 1,
      },
    };

    const m = mapTweetToMetrics(tweet);
    expect(m.views).toBe(0);
    expect(m.engagementRate).toBe(0);
  });

  it("returns all zeros when public_metrics is missing, without throwing", () => {
    const m = mapTweetToMetrics({ id: "5" });

    expect(m.likes).toBe(0);
    expect(m.reposts).toBe(0);
    expect(m.replies).toBe(0);
    expect(m.views).toBe(0);
    expect(m.bookmarks).toBe(0);
    expect(m.linkClicks).toBeUndefined();
    expect(m.profileClicks).toBeUndefined();
    expect(m.engagements).toBeUndefined();
    expect(m.engagementRate).toBe(0);
  });
});

describe("fetchMetrics", () => {
  it("returns {} and does not call fetch for empty ids", async () => {
    const fetchImpl = vi.fn();
    const result = await fetchMetrics("tok", [], fetchImpl as unknown as typeof fetch);

    expect(result).toEqual({});
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("keys the result record by tweet id", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse({
        data: [
          { id: "a", public_metrics: { like_count: 1, impression_count: 10 } },
          { id: "b", public_metrics: { like_count: 2, impression_count: 20 } },
        ],
      }),
    );

    const result = await fetchMetrics("tok", ["a", "b"], fetchImpl as unknown as typeof fetch);

    expect(Object.keys(result)).toEqual(["a", "b"]);
    expect(result.a.likes).toBe(1);
    expect(result.b.likes).toBe(2);
  });

  it("requests only the first 100 ids", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));
    const ids = Array.from({ length: 150 }, (_, i) => String(i));

    await fetchMetrics("tok", ids, fetchImpl as unknown as typeof fetch);

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const url = fetchImpl.mock.calls[0][0] as string;
    const idsParam = decodeURIComponent(url).match(/ids=([^&]+)/)![1];
    const requestedIds = idsParam.split(",");
    expect(requestedIds).toHaveLength(100);
    expect(requestedIds[0]).toBe("0");
    expect(requestedIds[99]).toBe("99");
    expect(requestedIds).not.toContain("100");
  });

  it("includes non_public_metrics field and bearer token in the request", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [] }));

    await fetchMetrics("secret-token", ["a"], fetchImpl as unknown as typeof fetch);

    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toContain("non_public_metrics");
    expect((init as RequestInit).cache).toBe("no-store");
    expect((init as RequestInit).headers).toMatchObject({
      Authorization: "Bearer secret-token",
    });
  });

  it("throws with the status when the response is not ok", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: "Unauthorized",
      text: async () => "bad token",
      json: async () => ({}),
    });

    await expect(
      fetchMetrics("tok", ["a"], fetchImpl as unknown as typeof fetch),
    ).rejects.toThrow(/401/);
  });
});
