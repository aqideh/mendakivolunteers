import { describe, expect, it } from "vitest";

import { FAQ_SECTIONS } from "./faq";

describe("FAQ content", () => {
  it("keeps published FAQ entries complete and questions unique", () => {
    const questions = new Set<string>();

    for (const section of FAQ_SECTIONS) {
      expect(section.title.trim().length).toBeGreaterThan(0);

      for (const item of section.items) {
        const question = item.question.trim();
        const answer = item.answer.trim();

        expect(question.length).toBeGreaterThan(0);
        expect(answer.length).toBeGreaterThan(0);
        expect(questions.has(question)).toBe(false);

        questions.add(question);
      }
    }
  });
});
