import { redirect } from "next/navigation";

type PackagesRedirectProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function PackageRedirect({
  params,
  searchParams,
}: PackagesRedirectProps) {
  const { slug } = await params;
  const parameters = await searchParams;
  const query = new URLSearchParams();

  for (const [name, value] of Object.entries(parameters)) {
    if (Array.isArray(value)) {
      value.forEach((item) => query.append(name, item));
    } else if (value !== undefined) {
      query.set(name, value);
    }
  }

  const suffix = query.size > 0 ? `?${query.toString()}` : "";
  redirect(`/updates/${slug}${suffix}`);
}
