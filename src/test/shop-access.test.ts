import { describe, it, expect } from "vitest";
import { canUseTestShop } from "@/lib/fiskal/shop-access";
const owner = "u-owner";
describe("canUseTestShop", () => {
  it("testing mode + anonymous = allowed", () => expect(canUseTestShop({ demo_mode: true, user_id: owner }, null)).toBe(true));
  it("live + anonymous = refused", () => expect(canUseTestShop({ demo_mode: false, user_id: owner }, null)).toBe(false));
  it("live + owner = allowed", () => expect(canUseTestShop({ demo_mode: false, user_id: owner }, owner)).toBe(true));
  it("live + other user = refused", () => expect(canUseTestShop({ demo_mode: false, user_id: owner }, "u-other")).toBe(false));
});
