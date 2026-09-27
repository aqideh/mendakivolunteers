"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import { requireActiveAccount } from "@/lib/auth/account-access";

const shirtTypes = ["round_neck", "collared"] as const;
const shirtSizes = ["S", "M", "L", "XL", "2XL", "3XL", "5XL", "7XL"] as const;
const stockTypes = ["opening", "receipt", "adjustment", "return"] as const;

async function requireInventoryManager() {
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

  return supabase as unknown as SupabaseClient;
}

export async function recordShirtStock(formData: FormData) {
  const parsed = z.object({
    shirtType: z.enum(shirtTypes),
    size: z.enum(shirtSizes),
    transactionType: z.enum(stockTypes),
    quantityDelta: z.coerce.number().int().refine((value) => value !== 0),
    reason: z.string().trim().max(1000).optional(),
  }).safeParse({
    shirtType: formData.get("shirtType"),
    size: formData.get("size"),
    transactionType: formData.get("transactionType"),
    quantityDelta: formData.get("quantityDelta"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirect("/admin/inventory/shirts?error=validation");
  }

  const client = await requireInventoryManager();
  const result = await client.rpc("record_volunteer_shirt_stock", {
    p_shirt_type: parsed.data.shirtType,
    p_size: parsed.data.size,
    p_quantity_delta: parsed.data.quantityDelta,
    p_transaction_type: parsed.data.transactionType,
    p_reason: parsed.data.reason || null,
  });

  if (result.error) {
    console.error("Unable to record volunteer shirt stock", {
      code: result.error.code,
    });
    redirect("/admin/inventory/shirts?error=stock");
  }

  revalidatePath("/admin/inventory/shirts");
  redirect("/admin/inventory/shirts?success=stock");
}

export async function recordPreviousShirtIssue(formData: FormData) {
  const parsed = z.object({
    volunteerId: z.string().uuid(),
    shirtType: z.enum(shirtTypes),
    size: z.enum(shirtSizes),
    issuedAt: z.string().datetime({ offset: true }).optional().or(z.literal("")),
    note: z.string().trim().max(1000).optional(),
  }).safeParse({
    volunteerId: formData.get("volunteerId"),
    shirtType: formData.get("shirtType"),
    size: formData.get("size"),
    issuedAt: formData.get("issuedAt"),
    note: formData.get("note"),
  });

  if (!parsed.success) {
    redirect("/admin/inventory/shirts?error=legacy_validation");
  }

  const client = await requireInventoryManager();
  const result = await client.rpc("mark_previous_volunteer_shirt_issue", {
    p_volunteer_id: parsed.data.volunteerId,
    p_shirt_type: parsed.data.shirtType,
    p_size: parsed.data.size,
    p_issued_at: parsed.data.issuedAt || new Date().toISOString(),
    p_note: parsed.data.note || null,
  });

  if (result.error) {
    console.error("Unable to record previous volunteer shirt", {
      code: result.error.code,
    });
    redirect("/admin/inventory/shirts?error=legacy");
  }

  revalidatePath("/admin/inventory/shirts");
  redirect("/admin/inventory/shirts?success=legacy");
}
