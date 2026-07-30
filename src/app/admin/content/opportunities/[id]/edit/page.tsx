import { redirect } from "next/navigation";

export default function EditOpportunityPage() {
  redirect(
    "/admin/content?error=Opportunity%20editing%20is%20temporarily%20paused.",
  );
}
