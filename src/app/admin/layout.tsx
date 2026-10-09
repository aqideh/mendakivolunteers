import "./admin-foundation.css";

import { AdminShell } from "@/components/admin-shell";
import { AdminQueryProvider } from "@/components/query/admin-query-provider";
import { getAttendanceOperatorEventIds } from "@/lib/auth/event-access";
import { createClient } from "@/lib/supabase/server";

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  const email =
    typeof claimsData?.claims?.email === "string"
      ? claimsData.claims.email
      : undefined;

  let roles: string[] = [];

  if (userId) {
    const { data: roleRows, error } = await supabase
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (!error) {
      roles = (roleRows ?? []).map(({ role }) => String(role));
    }
  }

  if (userId && roles.includes("volunteer") && !roles.some((role) =>
    ["admin", "volteam", "staff", "volunteer_leader"].includes(role))) {
    const events = await getAttendanceOperatorEventIds(userId, ["volunteer"]);
    if (events && events.size > 0) roles = [...roles, "scoped_attendance"];
  }

  return (
    <AdminQueryProvider>
      <AdminShell email={email} roles={roles}>
        {children}
      </AdminShell>
    </AdminQueryProvider>
  );
}
