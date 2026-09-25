export type FaqItem = Readonly<{
  question: string;
  answer: string;
}>;

export type FaqSection = Readonly<{
  title: string;
  eyebrow: string;
  items: readonly FaqItem[];
}>;

/**
 * Volunteer-facing FAQ copy. Keep answers concise and operational so the
 * accordion remains easy to scan on mobile.
 */
export const FAQ_SECTIONS: readonly FaqSection[] = [
  {
    title: "Getting started",
    eyebrow: "Volunteering with MENDAKI",
    items: [
      {
        question: "Do I need to be Malay/Muslim to volunteer with MENDAKI?",
        answer:
          "No. Our volunteering opportunities are open to anyone who would like to contribute their time, skills and energy to support our community.",
      },
      {
        question: "Do I need previous volunteering experience?",
        answer:
          "Not for most opportunities. If a role requires specific skills, training, experience or other prerequisites, these will be stated in the opportunity details.",
      },
      {
        question: "How do I volunteer for an opportunity?",
        answer:
          "Browse the available opportunities on Keluarga, select an activity that interests you, and choose the relevant date or shift to register. Some activities may have limited capacity or specific requirements, so please review the details before registering.",
      },
    ],
  },
  {
    title: "Participation and volunteering records",
    eyebrow: "Hours, attendance and cancellations",
    items: [
      {
        question: "What will happen to my volunteering hours on VolunteerSG after the migration?",
        answer:
          "MENDAKI will continue to keep a record of your past volunteering with us. After the migration, however, we will no longer be able to credit new MENDAKI volunteering hours to VolunteerSG. Your future participation and verified hours will be recorded in MENDAKI's systems.",
      },
      {
        question: "How are my volunteering hours recorded?",
        answer:
          "Your attendance and volunteering hours are recorded through MENDAKI's volunteer management systems. For activities using Keluarga attendance, remember to check in and check out so your participation can be properly recorded.",
      },
      {
        question: "What should I do if I can no longer attend an activity?",
        answer:
          "Please cancel your registration or inform the activity organiser as early as possible. This allows the slot to be offered to another volunteer and helps the organising team plan accordingly.",
      },
    ],
  },
  {
    title: "Testimonials and support",
    eyebrow: "Recognition and help",
    items: [
      {
        question: "Can I request a volunteer testimonial?",
        answer:
          "Yes. Volunteers may request a testimonial after completing a minimum of 24 hours of service within the same calendar year. Please allow up to 10 working days for your request to be processed.",
      },
      {
        question: "Who can I contact if I have a question or issue?",
        answer:
          "For volunteering queries, account issues or other support, please contact the MENDAKI Volunteer Management team at volunteer@mendaki.org.sg.",
      },
    ],
  },
];
