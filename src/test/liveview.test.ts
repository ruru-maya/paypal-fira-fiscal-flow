import { describe, expect, it } from "vitest";
import { scrubText } from "@/lib/fiskal/crypto";
describe("live view masking", () => {
  it("masks emails and payer names", () => {
    const out = scrubText("Ana Horvat (ana@example.com) paid", ["Ana", "Horvat"])!;
    expect(out).not.toContain("ana@example.com");
    expect(out).not.toContain("Horvat");
    expect(out).toContain("A•••");
  });
});
