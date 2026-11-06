import { describe, expect, it } from "vitest";
import * as blog from "../examples/01-blog-homepage.js";
import * as shop from "../examples/02-shop-showcase.js";
import * as gallery from "../examples/03-community-gallery.js";
import * as catalogue from "../examples/04-multilingual-catalogue.js";
import * as fairness from "../examples/05-simulate-fairness.js";
import * as reserved from "../examples/06-reserved-and-thin-pools.js";

describe("examples run and stay deterministic", () => {
  it("01 blog homepage fills three roles", () => {
    const picks = blog.run();
    expect(picks.map((pick) => pick.role)).toEqual(["new", "underexposed", "rediscovery"]);
    expect(picks).toEqual(blog.run());
  });

  it("02 shop showcase rotates categories and respects the season", () => {
    const picks = shop.run("2026-11-07");
    expect(picks).toHaveLength(3);
    expect(new Set(picks.map((pick) => pick.lane)).size).toBe(3);
    const seasonal = picks.find((pick) => pick.role === "seasonal");
    expect(seasonal?.item.seasons).toContain(11);
    expect(shop.showcase.lanesFor("2026-11-07", { month: 11 })).not.toEqual(shop.showcase.lanesFor("2026-11-08", { month: 11 }));
  });

  it("03 community gallery shows every work within a week", () => {
    const { log } = gallery.run(7);
    expect(new Set(log.map((entry) => entry.workId)).size).toBe(7);
    expect(log).toHaveLength(28);
  });

  it("04 multilingual catalogue gives each audience its preferred language", () => {
    const { ja, en } = catalogue.run();
    expect(ja.find((pick) => pick.lane === "preferred")?.item.language).toBe("ja");
    expect(en.find((pick) => pick.lane === "preferred")?.item.language).toBe("en");
  });

  it("05 simulation spreads showings evenly", () => {
    const result = fairness.run(90);
    expect(result.summary.neverShown).toBe(0);
    expect(result.summary.gini).toBeLessThan(0.2);
  });

  it("06 reserved positions and thin pools behave as documented", () => {
    const { withFeature, thin } = reserved.run();
    expect(withFeature.map((pick) => pick.position)).toEqual([2, 3]);
    expect(withFeature.map((pick) => pick.id)).not.toContain("feature");
    expect(thin).toHaveLength(2);
    expect(thin.some((pick) => pick.relaxation === 3)).toBe(true);
  });
});
