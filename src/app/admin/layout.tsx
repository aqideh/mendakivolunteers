import { AdminShell } from "@/components/admin-shell";
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

  return (
    <AdminShell email={email} roles={roles}>
      {children}
    </AdminShell>
  );
}
