import { describe, expect, it } from "vitest";
import { createMemoryD1 } from "../memory-d1.js";
import {
  createIntervention,
  deleteIntervention,
  getIntervention,
  listInterventionsByUser,
  markInterventionSent,
  recordInterventionResponse,
} from "./interventions.js";

describe("interventions repo", () => {
  it("creates a drafted intervention", async () => {
    const d1 = createMemoryD1();
    const row = await createIntervention(d1, {
      userId: "u",
      packSlug: "intervention/file-ftc-complaint",
      payload: { business: "marriott.com", fee: 49 },
      relatedPurchaseId: "p123",
    });
    expect(row.status).toBe("drafted");
    expect(row.related_purchase_id).toBe("p123");
    expect(JSON.parse(row.payload_json).fee).toBe(49);
  });

  it("retrieves by id", async () => {
    const d1 = createMemoryD1();
    const row = await createIntervention(d1, {
      userId: "u",
      packSlug: "intervention/draft-magnuson-moss-return",
      payload: {},
    });
    const fetched = await getIntervention(d1, row.id);
    expect(fetched?.id).toBe(row.id);
  });

  it("markInterventionSent transitions to sent + timestamps", async () => {
    const d1 = createMemoryD1();
    const row = await createIntervention(d1, {
      userId: "u",
      packSlug: "intervention/file-ftc-complaint",
      payload: {},
    });
    expect(row.sent_at).toBeNull();
    await markInterventionSent(d1, row.id);
    const after = await getIntervention(d1, row.id);
    expect(after!.status).toBe("sent");
    expect(after!.sent_at).not.toBeNull();
  });

  it("recordInterventionResponse captures regulator reply", async () => {
    const d1 = createMemoryD1();
    const row = await createIntervention(d1, {
      userId: "u",
      packSlug: "intervention/file-ftc-complaint",
      payload: {},
    });
    await recordInterventionResponse(d1, row.id, "resolved", {
      acknowledged: true,
      refund: 49,
    });
    const after = await getIntervention(d1, row.id);
    expect(after!.status).toBe("resolved");
    expect(after!.response_received_at).not.toBeNull();
    expect(JSON.parse(after!.response_payload_json!).refund).toBe(49);
  });

  it("lists interventions by user + optional status filter", async () => {
    const d1 = createMemoryD1();
    await createIntervention(d1, {
      userId: "u",
      packSlug: "intervention/a",
      payload: {},
    });
    const second = await createIntervention(d1, {
      userId: "u",
      packSlug: "intervention/b",
      payload: {},
    });
    await markInterventionSent(d1, second.id);
    await createIntervention(d1, {
      userId: "other",
      packSlug: "intervention/c",
      payload: {},
    });
    const all = await listInterventionsByUser(d1, "u");
    const sent = await listInterventionsByUser(d1, "u", "sent");
    expect(all).toHaveLength(2);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.pack_slug).toBe("intervention/b");
  });

  it("deletes an intervention", async () => {
    const d1 = createMemoryD1();
    const row = await createIntervention(d1, {
      userId: "u",
      packSlug: "intervention/x",
      payload: {},
    });
    await deleteIntervention(d1, row.id);
    expect(await getIntervention(d1, row.id)).toBeNull();
  });
});
