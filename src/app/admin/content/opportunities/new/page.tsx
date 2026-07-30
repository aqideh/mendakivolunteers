import { redirect } from "next/navigation";

export default function NewOpportunityPage() {
  redirect(
    "/admin/content?error=Opportunity%20creation%20is%20temporarily%20paused.",
  );
}
