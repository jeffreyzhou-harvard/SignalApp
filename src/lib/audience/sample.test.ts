import { describe, expect, it } from "vitest";
import { sampleForPublic } from "./sample";
import type { AudienceMember, AudienceSnapshot } from "./types";

function member(i: number, clusterId: string, deep: boolean): AudienceMember {
  return {
    id: i,
    name: `User ${i}`,
    handle: `@user${i}`,
    bio: "",
    avatar: "",
    clusterId,
    pos: [0, 0, 0],
    deep,
  };
}

/** `sizes` maps clusterId -> [deepCount, shallowCount]. */
function snapshot(sizes: Record<string, [number, number]>): AudienceSnapshot {
  const members: AudienceMember[] = [];
  let i = 0;
  for (const [clusterId, [deep, shallow]] of Object.entries(sizes)) {
    for (let d = 0; d < deep; d++) members.push(member(i++, clusterId, true));
    for (let s = 0; s < shallow; s++) members.push(member(i++, clusterId, false));
  }
  return {
    totalFollowers: members.length,
    clusters: Object.keys(sizes).map((id) => ({
      id,
      label: id,
      members: sizes[id][0] + sizes[id][1],
      color: "#000",
      blurb: "",
      center: [0, 0, 0],
    })),
    members,
    source: "test",
    synthetic: false,
  };
}

describe("sampleForPublic", () => {
  it("leaves a small audience untouched", () => {
    const snap = snapshot({ a: [10, 10], b: [5, 5] });
    expect(sampleForPublic(snap, 500)).toBe(snap);
  });

  it("keeps each tribe's share of the drawn galaxy", () => {
    const snap = snapshot({ big: [100, 500], mid: [50, 150], small: [20, 80] });
    const out = sampleForPublic(snap, 200);
    const share = (id: string) =>
      out.members.filter((m) => m.clusterId === id).length / out.members.length;
    expect(share("big")).toBeCloseTo(600 / 900, 1);
    expect(share("mid")).toBeCloseTo(200 / 900, 1);
    expect(share("small")).toBeCloseTo(100 / 900, 1);
  });

  it("spends the allowance on deep members first, then fills with the halo", () => {
    const out = sampleForPublic(snapshot({ a: [50, 450] }), 100);
    expect(out.members.filter((m) => m.deep)).toHaveLength(50); // every deep one kept
    expect(out.members).toHaveLength(100); // remainder drawn from the halo
  });

  it("draws only deep members when they alone exceed the allowance", () => {
    const out = sampleForPublic(snapshot({ a: [400, 100] }), 100);
    expect(out.members.every((m) => m.deep)).toBe(true);
  });

  it("never drops a tribe entirely, even a tiny one", () => {
    const out = sampleForPublic(snapshot({ huge: [0, 5000], tiny: [1, 1] }), 100);
    expect(out.members.some((m) => m.clusterId === "tiny")).toBe(true);
  });

  it("is deterministic, so the same faces survive every rebuild", () => {
    const snap = snapshot({ a: [10, 300], b: [5, 200] });
    const ids = (s: AudienceSnapshot) => s.members.map((m) => m.id).join(",");
    expect(ids(sampleForPublic(snap, 100))).toBe(ids(sampleForPublic(snap, 100)));
  });

  it("reports the real audience size regardless of how many dots are drawn", () => {
    const snap = snapshot({ a: [100, 900] });
    const out = sampleForPublic(snap, 100);
    expect(out.members.length).toBeLessThan(snap.members.length);
    expect(out.clusters[0].members).toBe(1000);
    expect(out.totalFollowers).toBe(snap.totalFollowers);
  });
});
