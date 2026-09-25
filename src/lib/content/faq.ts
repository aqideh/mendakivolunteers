export type FaqItem = Readonly<{
  question: string;
  answer: string;
}>;

export type FaqSection = Readonly<{
  title: string;
  items: readonly FaqItem[];
}>;

/**
 * Volunteer-facing FAQ copy. Keep answers concise and operational so the
 * accordion remains easy to scan on mobile.
 */
export const FAQ_SECTIONS: readonly FaqSection[] = [
  {
    title: "Getting started",
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
          "If you can no longer attend, please withdraw from the activity by contacting the Volunteer Management team as early as possible via email at volunteer@mendaki.org.sg or WhatsApp. This allows us to release your slot to another volunteer and helps the organising team plan accordingly.",
      },
    ],
  },
  {
    title: "Testimonials and support",
    items: [
      {
        question: "Can I request a volunteer testimonial?",
        answer:
          "Yes. Volunteers may request a testimonial after completing a minimum of 24 hours of service within the same calendar year. Please allow up to 5 working days for your request to be processed.",
      },
    ],
  },
];
