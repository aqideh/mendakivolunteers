export type FaqItem = Readonly<{
  question: string;
  answer: string;
}>;

export type FaqSection = Readonly<{
  title: string;
  items: readonly FaqItem[];
}>;

/**
 * FAQ copy is intentionally kept separate from the page layout so approved
 * volunteer-facing content can be added without changing the route structure.
 *
 * Content will be supplied by Volunteer Management.
 */
export const FAQ_SECTIONS: readonly FaqSection[] = [];
