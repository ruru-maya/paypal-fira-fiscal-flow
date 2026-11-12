import { describe, expect, it } from "vitest";
import { isAwaitingFira, SENDING_WINDOW_MS, withDisplayStatus } from "@/lib/fiskal/display-status";
import { detectCompany } from "@/lib/fiskal/payer";

const t0 = Date.parse("2026-11-12T10:00:00Z");
const pending = {
  status: "failed",
  created_at: new Date(t0).toISOString(),
  fira_response: null,
  fira_error: null,
  line_items: [{ name: "Mug" }],
  validation_errors: [],
};

describe("display status while FIRA answers", () => {
  it("fresh document waiting for FIRA shows as sending", () =>
    expect(withDisplayStatus(pending, t0 + 3000).status).toBe("sending"));
  it("after the window it is a problem again", () =>
    expect(withDisplayStatus(pending, t0 + SENDING_WINDOW_MS + 1).status).toBe("failed"));
  it("FIRA answered → real status kept", () =>
    expect(isAwaitingFira({ ...pending, fira_response: { status: 500 } }, t0 + 1000)).toBe(false));
  it("FIRA error → real status kept", () =>
    expect(isAwaitingFira({ ...pending, fira_error: "FIRA key invalid" }, t0 + 1000)).toBe(false));
  it("processing crash (no lines) → real status kept", () =>
    expect(isAwaitingFira({ ...pending, line_items: null }, t0 + 1000)).toBe(false));
  it("validation errors → real status kept", () =>
    expect(isAwaitingFira({ ...pending, validation_errors: ["Totals differ"] }, t0 + 1000)).toBe(
      false,
    ));
  it("other statuses untouched", () =>
    expect(withDisplayStatus({ ...pending, status: "sent" }, t0 + 1000).status).toBe("sent"));
});

describe("detectCompany", () => {
  it("business_name without shipping does not crash", () =>
    expect(detectCompany({ business_name: "Acme d.o.o." }, {})).toBe("Acme d.o.o."));
  it("business_name with undefined purchase unit", () =>
    expect(detectCompany({ business_name: "Acme GmbH" }, undefined)).toBe("Acme GmbH"));
  it("legal suffix in shipping name", () =>
    expect(detectCompany({}, { shipping: { name: { full_name: "Foo d.o.o." } } })).toBe(
      "Foo d.o.o.",
    ));
  it("private person", () =>
    expect(detectCompany({}, { shipping: { name: { full_name: "Ana Horvat" } } })).toBeUndefined());
  it("nothing at all", () => expect(detectCompany(undefined, undefined)).toBeUndefined());
});
