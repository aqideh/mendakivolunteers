import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

type EventPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ access?: string }>;
};

export default async function EventPage({ params, searchParams }: EventPageProps) {
  const { slug } = await params;
  const { access } = await searchParams;
  const query = access === "expired" || access === "unavailable"
    ? `?access=${access}`
    : "";

  redirect(`/packages/${slug}${query}`);
}
