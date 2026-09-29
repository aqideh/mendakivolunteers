export type ProfessionalNetwork = Readonly<{
  slug: string;
  name: string;
  linkedinUrl: string;
  description?: string;
  sourceUrl?: string;
  heroImage?: string;
  coreTeam: readonly Readonly<{ name: string; role?: string }>[];
}>;

export const professionalNetworks: readonly ProfessionalNetwork[] = [
  {
    slug: "aerospace-and-aviation",
    name: "Aerospace and Aviation",
    linkedinUrl: "https://www.linkedin.com/groups/14406677/",
    sourceUrl: "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdPREA0/aerospace-and-aviation",
    description: "A fraternity of professionals from the Singapore's Aviation sector as part of MENDAKI Professional Networks which aims to build and enhance your career capital including leadership by connecting you to other Malay/Muslim professionals and providing opportunities for you to contribute back to the community.",
    coreTeam: [],
  },
  { slug: "banking-and-finance", name: "Banking & Finance", linkedinUrl: "https://www.linkedin.com/groups/14161777/", coreTeam: [] },
  { slug: "early-childhood", name: "Early Childhood", linkedinUrl: "https://www.linkedin.com/groups/14290278/", coreTeam: [] },
  { slug: "education", name: "Education", linkedinUrl: "https://www.linkedin.com/groups/36980182/", coreTeam: [] },
  { slug: "engineering", name: "Engineering", linkedinUrl: "https://www.linkedin.com/groups/14237296/", coreTeam: [] },
  { slug: "entrepreneurship", name: "Entrepreneurship", linkedinUrl: "https://www.linkedin.com/groups/23250004/", coreTeam: [] },
  { slug: "healthcare", name: "Healthcare", linkedinUrl: "https://www.linkedin.com/groups/14276878/", coreTeam: [] },
  { slug: "human-resources", name: "Human Resources", linkedinUrl: "https://www.linkedin.com/groups/14289305/", coreTeam: [] },
  { slug: "legal", name: "Legal", linkedinUrl: "https://www.linkedin.com/groups/14249872/", coreTeam: [] },
  { slug: "life-sciences", name: "Life Sciences", linkedinUrl: "https://www.linkedin.com/groups/14115620/", coreTeam: [] },
  { slug: "media-and-creatives", name: "Media & Creatives", linkedinUrl: "https://www.linkedin.com/groups/14284323/", coreTeam: [] },
  { slug: "public-sector", name: "Public Sector", linkedinUrl: "https://www.linkedin.com/groups/14288321/", coreTeam: [] },
  { slug: "social-services", name: "Social Services", linkedinUrl: "https://www.linkedin.com/groups/14284320/", coreTeam: [] },
  { slug: "sports", name: "Sports", linkedinUrl: "https://www.linkedin.com/groups/14288285/", coreTeam: [] },
  { slug: "sustainability", name: "Sustainability", linkedinUrl: "https://www.linkedin.com/groups/14287266/", coreTeam: [] },
  { slug: "tech", name: "Tech", linkedinUrl: "https://www.linkedin.com/groups/14502157/", coreTeam: [] },
] as const;

export function getProfessionalNetwork(slug: string): ProfessionalNetwork | undefined {
  return professionalNetworks.find((network) => network.slug === slug);
}
