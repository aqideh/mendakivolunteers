import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  recordPreviousShirtIssue,
  recordShirtStock,
} from "@/app/admin/inventory/shirts/actions";
import { PortalHeader } from "@/components/portal-header";
import { requireActiveAccount } from "@/lib/auth/account-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = {
  title: "Volunteer shirt inventory",
};

export const dynamic = "force-dynamic";

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const sizes = ["S", "M", "L", "XL", "2XL", "3XL", "5XL", "7XL"] as const;

function parameter(
  values: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function shirtTypeLabel(value: string) {
  return value === "collared" ? "Collared" : "Round-neck";
}

export default async function ShirtInventoryPage({ searchParams }: PageProps) {
  const { supabase, userId } = await requireActiveAccount("/admin/inventory/shirts");
  const rolesResult = await supabase
    .schema("core")
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (
    rolesResult.error ||
    !(rolesResult.data ?? []).some(({ role }) => role === "volteam" || role === "admin")
  ) {
    redirect("/dashboard?error=event_access_denied");
  }

  const admin = getPhaseOneAdminClient();
  const [stockResult, transactionResult, volunteerResult, issuanceResult] =
    await Promise.all([
      admin
        .from("volunteer_shirt_stock")
        .select("sku_id, shirt_type, size, quantity_on_hand, active")
        .eq("active", true),
      admin
        .from("volunteer_shirt_inventory_transactions")
        .select(
          "id, transaction_type, quantity_delta, reason, recorded_at, sku_id, volunteer_shirt_skus(shirt_type,size)",
        )
        .order("recorded_at", { ascending: false })
        .limit(40),
      admin
        .schema("core")
        .from("volunteers")
        .select("id, volunteer_code, display_name")
        .order("display_name")
        .limit(2000),
      admin
        .from("volunteer_shirt_issuances")
        .select("id, volunteer_id, issued_at, issuance_source, collection_method, preferred_size_at_issue, issue_kind, issue_reason, event_id, note, volunteer_shirt_skus(shirt_type,size), phaseone_events(title)")
        .order("issued_at", { ascending: false }),
    ]);

  if (
    stockResult.error ||
    transactionResult.error ||
    volunteerResult.error ||
    issuanceResult.error
  ) {
    throw new Error("Volunteer shirt inventory could not be loaded");
  }

  const issuedVolunteerIds = new Set(
    (issuanceResult.data ?? []).map(({ volunteer_id }) => volunteer_id),
  );
  const volunteerById = new Map(
    (volunteerResult.data ?? []).map((volunteer) => [volunteer.id, volunteer]),
  );
  const volunteersWithoutIssue = (volunteerResult.data ?? []).filter(
    ({ id }) => !issuedVolunteerIds.has(id),
  );

  const stock = stockResult.data ?? [];
  const quantity = (shirtType: string, size: string) =>
    stock.find(
      (item) => item.shirt_type === shirtType && item.size === size,
    )?.quantity_on_hand ?? 0;

  const parameters = await searchParams;
  const success = parameter(parameters, "success");
  const error = parameter(parameters, "error");

  return (
    <div className="site-shell">
      <PortalHeader status="Shirt inventory" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <h1>Volunteer shirt inventory</h1>
            <p className="muted">
              Track stock by shirt type and size. Initial collection and any authorised additional issues are kept as a full issuance history.
            </p>
          </div>
        </div>

        {success ? (
          <div className="notice notice-success" role="status">
            {success === "legacy"
              ? "Previous shirt issue recorded."
              : "Inventory updated."}
          </div>
        ) : null}
        {error ? (
          <div className="notice notice-error" role="alert">
            The inventory change could not be saved. Check the details and available stock.
          </div>
        ) : null}

        <section className="section" aria-labelledby="stock-title">
          <div className="section-header">
            <div>
              <h2 id="stock-title">Current stock</h2>
              <p className="muted">Available pieces after receipts, adjustments and issues.</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  <th>Size</th>
                  <th>Round-neck</th>
                  <th>Collared</th>
                </tr>
              </thead>
              <tbody>
                {sizes.map((size) => (
                  <tr key={size}>
                    <th scope="row">{size}</th>
                    <td>{quantity("round_neck", size)}</td>
                    <td>{quantity("collared", size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section" aria-labelledby="stock-change-title">
          <div className="section-header">
            <div>
              <h2 id="stock-change-title">Record stock movement</h2>
              <p className="muted">
                Use receipt for incoming stock, opening for the first stock count, and adjustment for stocktake corrections.
              </p>
            </div>
          </div>
          <form action={recordShirtStock} className="phaseone-admin-form">
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="inventory-shirt-type">Shirt type</label>
                <select id="inventory-shirt-type" name="shirtType" required>
                  <option value="round_neck">Round-neck</option>
                  <option value="collared">Collared</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="inventory-size">Size</label>
                <select id="inventory-size" name="size" required>
                  {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="inventory-transaction-type">Movement</label>
                <select id="inventory-transaction-type" name="transactionType" required>
                  <option value="receipt">Stock received</option>
                  <option value="opening">Opening stock</option>
                  <option value="adjustment">Stocktake adjustment</option>
                  <option value="return">Return to stock</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="inventory-quantity">Quantity change</label>
                <input
                  id="inventory-quantity"
                  name="quantityDelta"
                  type="number"
                  step="1"
                  placeholder="e.g. 20 or -2"
                  required
                />
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="inventory-reason">Reason / reference <span className="muted">(optional)</span></label>
              <input id="inventory-reason" name="reason" maxLength={1000} />
            </div>
            <div className="actions">
              <button className="button button-primary" type="submit">Record movement</button>
            </div>
          </form>
        </section>

        <section className="section" aria-labelledby="previous-shirt-title">
          <div className="section-header">
            <div>
              <h2 id="previous-shirt-title">Record a previous shirt issue</h2>
              <p className="muted">
                Use this only when no shirt record exists yet and the volunteer had already collected one before KELUARGA tracked inventory.
                This does not reduce current stock.
              </p>
            </div>
          </div>
          <form action={recordPreviousShirtIssue} className="phaseone-admin-form">
            <div className="form-field">
              <label htmlFor="previous-volunteer">Volunteer</label>
              <select id="previous-volunteer" name="volunteerId" required>
                <option value="" disabled selected>Select volunteer</option>
                {volunteersWithoutIssue.map((volunteer) => (
                  <option value={volunteer.id} key={volunteer.id}>
                    {volunteer.volunteer_code} · {volunteer.display_name ?? "Volunteer"}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-grid">
              <div className="form-field">
                <label htmlFor="previous-shirt-type">Shirt type</label>
                <select id="previous-shirt-type" name="shirtType" required>
                  <option value="round_neck">Round-neck</option>
                  <option value="collared">Collared</option>
                </select>
              </div>
              <div className="form-field">
                <label htmlFor="previous-size">Size</label>
                <select id="previous-size" name="size" required>
                  {sizes.map((size) => <option key={size} value={size}>{size}</option>)}
                </select>
              </div>
            </div>
            <div className="form-field">
              <label htmlFor="previous-note">Note <span className="muted">(optional)</span></label>
              <input id="previous-note" name="note" maxLength={1000} />
            </div>
            <div className="actions">
              <button className="button button-secondary" type="submit">
                Mark as previously issued
              </button>
            </div>
          </form>
        </section>

        <section className="section" aria-labelledby="shirt-records-title">
          <div className="section-header">
            <div>
              <h2 id="shirt-records-title">Volunteer shirt records</h2>
              <p className="muted">
                Actual shirt received is kept separately from the volunteer&apos;s preferred size.
                Already-collected records do not reduce current stock.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  <th>Volunteer</th>
                  <th>Actual shirt</th>
                  <th>Preferred</th>
                  <th>Record</th>
                  <th>Reason</th>
                  <th>When</th>
                  <th>Event</th>
                </tr>
              </thead>
              <tbody>
                {(issuanceResult.data ?? []).map((row) => {
                  const volunteer = volunteerById.get(row.volunteer_id);
                  const sku = Array.isArray(row.volunteer_shirt_skus)
                    ? row.volunteer_shirt_skus[0]
                    : row.volunteer_shirt_skus;
                  const event = Array.isArray(row.phaseone_events)
                    ? row.phaseone_events[0]
                    : row.phaseone_events;
                  return (
                    <tr key={row.id}>
                      <td>
                        {volunteer
                          ? `${volunteer.volunteer_code} · ${volunteer.display_name ?? "Volunteer"}`
                          : row.volunteer_id}
                      </td>
                      <td>{sku ? `${shirtTypeLabel(sku.shirt_type)} · ${sku.size}` : "—"}</td>
                      <td>
                        {row.preferred_size_at_issue ?? "—"}
                        {row.preferred_size_at_issue && sku && row.preferred_size_at_issue !== sku.size
                          ? " · different size issued"
                          : ""}
                      </td>
                      <td>
                        {row.issue_kind === "additional"
                          ? "Additional issue"
                          : row.collection_method === "already_collected"
                            ? "Already collected"
                            : "Initial issue"}
                      </td>
                      <td>
                        {row.issue_reason
                          ? row.issue_reason.replaceAll("_", " ")
                          : "—"}
                      </td>
                      <td>{new Intl.DateTimeFormat("en-SG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Singapore",
                      }).format(new Date(row.issued_at))}</td>
                      <td>{event?.title ?? "—"}</td>
                    </tr>
                  );
                })}
                {(issuanceResult.data ?? []).length === 0 ? (
                  <tr><td colSpan={7}>No volunteer shirt records yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section" aria-labelledby="inventory-history-title">
          <div className="section-header">
            <div>
              <h2 id="inventory-history-title">Recent stock movements</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Shirt</th>
                  <th>Movement</th>
                  <th>Quantity</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {(transactionResult.data ?? []).map((row) => {
                  const sku = Array.isArray(row.volunteer_shirt_skus)
                    ? row.volunteer_shirt_skus[0]
                    : row.volunteer_shirt_skus;
                  return (
                    <tr key={row.id}>
                      <td>{new Intl.DateTimeFormat("en-SG", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        timeZone: "Asia/Singapore",
                      }).format(new Date(row.recorded_at))}</td>
                      <td>{sku ? `${shirtTypeLabel(sku.shirt_type)} · ${sku.size}` : "—"}</td>
                      <td>{row.transaction_type.replaceAll("_", " ")}</td>
                      <td>{row.quantity_delta > 0 ? `+${row.quantity_delta}` : row.quantity_delta}</td>
                      <td>{row.reason ?? "—"}</td>
                    </tr>
                  );
                })}
                {(transactionResult.data ?? []).length === 0 ? (
                  <tr><td colSpan={5}>No stock movements recorded yet.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
