import { readFileSync, writeFileSync } from "node:fs";

function patch(path, replacements) {
  let source = readFileSync(path, "utf8");
  for (const [before, after] of replacements) {
    if (!source.includes(before)) {
      throw new Error(`Expected source not found in ${path}: ${before.slice(0, 120)}`);
    }
    source = source.replace(before, after);
  }
  writeFileSync(path, source);
}

patch("src/lib/phaseone/event-validation.ts", [[
`  tshirt_size: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(20).nullable(),
  ),
});`,
`  tshirt_size: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(20).nullable(),
  ),
  dietary_requirements: z.preprocess(
    (value) => (typeof value === "string" && value.trim() ? value.trim() : null),
    z.string().max(500).nullable(),
  ),
});`
]]);

patch("src/lib/phaseone/event-validation.test.ts", [
[
`      mobile: "91234567",
      tshirt_size: "M",
    };`,
`      mobile: "91234567",
      tshirt_size: "M",
      dietary_requirements: "Vegetarian; peanut allergy",
    };`
],
[
`      rows: [{ ...row(morningId), mobile: " 91234567 ", tshirt_size: " L " }],`,
`      rows: [{ ...row(morningId), mobile: " 91234567 ", tshirt_size: " L ", dietary_requirements: " Vegetarian; peanut allergy " }],`
],
[
`    expect(parsed.data.rows[0]?.tshirt_size).toBe("L");
  });`,
`    expect(parsed.data.rows[0]?.tshirt_size).toBe("L");
    expect(parsed.data.rows[0]?.dietary_requirements).toBe("Vegetarian; peanut allergy");
  });

  it("rejects dietary requirements longer than 500 characters", () => {
    const parsed = rosterImportSchema.safeParse({
      eventId,
      mode: "merge",
      fileName: "roster.csv",
      rows: [{ ...row(morningId), dietary_requirements: "x".repeat(501) }],
    });

    expect(parsed.success).toBe(false);
  });`
]
]);

patch("src/components/phaseone/roster-upload.tsx", [
[
`  tshirt_size: string | null;
}>;`,
`  tshirt_size: string | null;
  dietary_requirements: string | null;
}>;`
],
[
`    tshirt_size: ["tshirt_size", "t_shirt_size", "shirt_size", "size"],
    date: ["date", "shift_date", "event_date"],`,
`    tshirt_size: ["tshirt_size", "t_shirt_size", "shirt_size", "size"],
    dietary_requirements: ["dietary_requirements", "dietary_requirement", "meal_preference", "meal_preferences", "dietary", "allergies", "allergy", "food_requirements"],
    date: ["date", "shift_date", "event_date"],`
],
[
`  const tshirtIndex = column("tshirt_size");
  const dateIndex = column("date");`,
`  const tshirtIndex = column("tshirt_size");
  const dietaryIndex = column("dietary_requirements");
  const dateIndex = column("date");`
],
[
`    const tshirtSize = tshirtIndex >= 0 ? values[tshirtIndex]?.trim() || null : null;

    const hasVolunteerData = Boolean(volunteerKey || volunteerName || email || mobile || tshirtSize);`,
`    const tshirtSize = tshirtIndex >= 0 ? values[tshirtIndex]?.trim() || null : null;
    const dietaryRequirements = dietaryIndex >= 0 ? values[dietaryIndex]?.trim() || null : null;

    const hasVolunteerData = Boolean(volunteerKey || volunteerName || email || mobile || tshirtSize || dietaryRequirements);`
],
[
`    if (tshirtSize && tshirtSize.length > 20) diagnostics.push({ row: rowNumber, code: "SIZE_TOO_LONG", message: "tshirt_size must be 20 characters or fewer." });`,
`    if (tshirtSize && tshirtSize.length > 20) diagnostics.push({ row: rowNumber, code: "SIZE_TOO_LONG", message: "tshirt_size must be 20 characters or fewer." });
    if (dietaryRequirements && dietaryRequirements.length > 500) diagnostics.push({ row: rowNumber, code: "DIETARY_TOO_LONG", message: "dietary_requirements must be 500 characters or fewer." });`
],
[
`        mobile,
        tshirt_size: tshirtSize,
      });`,
`        mobile,
        tshirt_size: tshirtSize,
        dietary_requirements: dietaryRequirements,
      });`
],
[
`            <li><code>contact_number</code>, <code>email</code>, <code>volunteer_id</code>, <code>tshirt_size</code> — optional</li>`,
`            <li><code>contact_number</code>, <code>email</code>, <code>volunteer_id</code>, <code>tshirt_size</code>, <code>dietary_requirements</code> — optional</li>`
],
[
`              <thead><tr><th>Name</th>{activeTimeslots.length > 1 ? <th>Shift</th> : null}<th>Contact</th></tr></thead>`,
`              <thead><tr><th>Name</th>{activeTimeslots.length > 1 ? <th>Shift</th> : null}<th>Contact</th><th>Meal / dietary</th></tr></thead>`
],
[
`                      <td>{contact}</td>
                    </tr>`,
`                      <td>{contact}</td>
                      <td>{row.dietary_requirements ?? "—"}</td>
                    </tr>`
]
]);

patch("src/app/admin/events/[id]/roster-template/route.ts", [
[
`    "tshirt_size",
    "volunteer_id",`,
`    "tshirt_size",
    "dietary_requirements",
    "volunteer_id",`
],
[
`    "Enter one volunteer per row. volunteer_name is required. volunteer_id, contact_number, email and tshirt_size are optional. Duplicate this row for more volunteers in the same shift. Keep date, shift and timeslot_id unchanged.";`,
`    "Enter one volunteer per row. volunteer_name is required. volunteer_id, contact_number, email, tshirt_size and dietary_requirements are optional. Use dietary_requirements for meal preferences, dietary needs or allergies. Duplicate this row for more volunteers in the same shift. Keep date, shift and timeslot_id unchanged.";`
],
[
`    "",
    "",
    singaporeDate(timeslot.starts_at),`,
`    "",
    "",
    "",
    singaporeDate(timeslot.starts_at),`
]
]);

patch("src/app/admin/events/[id]/attendance/actions.ts", [
[
`  tshirtSize: z.string().trim().max(20).optional(),
  submitIntent: z.enum(["add_and_check_in", "add_only"]),`,
`  tshirtSize: z.string().trim().max(20).optional(),
  dietaryRequirements: z.string().trim().max(500).optional(),
  submitIntent: z.enum(["add_and_check_in", "add_only"]),`
],
[
`    tshirtSize: formData.get("tshirtSize") || undefined,
    submitIntent: formData.get("submitIntent"),`,
`    tshirtSize: formData.get("tshirtSize") || undefined,
    dietaryRequirements: formData.get("dietaryRequirements") || undefined,
    submitIntent: formData.get("submitIntent"),`
],
[
`    p_tshirt_size: parsed.data.tshirtSize || null,
    p_check_in: parsed.data.submitIntent === "add_and_check_in",`,
`    p_tshirt_size: parsed.data.tshirtSize || null,
    p_dietary_requirements: parsed.data.dietaryRequirements || null,
    p_check_in: parsed.data.submitIntent === "add_and_check_in",`
]
]);

patch("src/app/admin/events/[id]/attendance/walk-in-actions.ts", [
[
`  mobile: z.string().trim().max(50).optional(),
});`,
`  mobile: z.string().trim().max(50).optional(),
  dietaryRequirements: z.string().trim().max(500).optional(),
});`
],
[
`    mobile: formData.get("mobile") || undefined,
  });`,
`    mobile: formData.get("mobile") || undefined,
    dietaryRequirements: formData.get("dietaryRequirements") || undefined,
  });`
],
[
`      mobile: parsed.data.mobile || null,
    })`,
`      mobile: parsed.data.mobile || null,
      dietary_requirements: parsed.data.dietaryRequirements || null,
    })`
]
]);

patch("src/components/phaseone/walk-in-edit-form.tsx", [
[
`  mobile: string | null;
};`,
`  mobile: string | null;
  dietaryRequirements: string | null;
};`
],
[
`  email,
  mobile,
}: WalkInEditFormProps) {`,
`  email,
  mobile,
  dietaryRequirements,
}: WalkInEditFormProps) {`
],
[
`          <div className="form-field">
            <label htmlFor={\`walk-in-edit-email-\${rosterId}\`}>Email</label>`,
`          <div className="form-field">
            <label htmlFor={\`walk-in-edit-email-\${rosterId}\`}>Email</label>`
],
[
`          </div>
        </div>
        <button className="button button-secondary" type="submit">Save corrected details</button>`,
`          </div>
          <div className="form-field">
            <label htmlFor={\`walk-in-edit-dietary-\${rosterId}\`}>Meal / dietary requirements</label>
            <textarea
              defaultValue={dietaryRequirements ?? ""}
              id={\`walk-in-edit-dietary-\${rosterId}\`}
              maxLength={500}
              name="dietaryRequirements"
              placeholder="e.g. Vegetarian; peanut allergy"
              rows={2}
            />
          </div>
        </div>
        <button className="button button-secondary" type="submit">Save corrected details</button>`
]
]);

patch("src/app/admin/events/[id]/attendance/page.tsx", [
[
`      .select("id, timeslot_id, volunteer_key, volunteer_name, email, mobile, tshirt_size, entry_method, attendance_person_key")`,
`      .select("id, timeslot_id, volunteer_key, volunteer_name, email, mobile, tshirt_size, dietary_requirements, entry_method, attendance_person_key")`
],
[
`      volunteer.tshirt_size,
    ].filter(Boolean).join(" ").toLowerCase();`,
`      volunteer.tshirt_size,
      volunteer.dietary_requirements,
    ].filter(Boolean).join(" ").toLowerCase();`
],
[
`                      <div className="form-field">
                        <label htmlFor="walk-in-shirt">T-shirt size</label>
                        <input id="walk-in-shirt" name="tshirtSize" maxLength={20} placeholder="e.g. M" />
                      </div>`,
`                      <div className="form-field">
                        <label htmlFor="walk-in-shirt">T-shirt size</label>
                        <input id="walk-in-shirt" name="tshirtSize" maxLength={20} placeholder="e.g. M" />
                      </div>
                      <div className="form-field">
                        <label htmlFor="walk-in-dietary">Meal / dietary requirements</label>
                        <textarea id="walk-in-dietary" name="dietaryRequirements" maxLength={500} placeholder="e.g. Vegetarian; peanut allergy" rows={2} />
                      </div>`
],
[
`                          <p className="muted">{volunteer.mobile ?? "No contact number"} · T-shirt: {volunteer.tshirt_size ?? "—"}</p>`,
`                          <p className="muted">{volunteer.mobile ?? "No contact number"} · T-shirt: {volunteer.tshirt_size ?? "—"}</p>
                          <p className="muted"><strong>Meal / dietary:</strong> {volunteer.dietary_requirements ?? "—"}</p>`
],
[
`                          mobile={volunteer.mobile}
                          rosterId={volunteer.id}`, 
`                          mobile={volunteer.mobile}
                          dietaryRequirements={volunteer.dietary_requirements}
                          rosterId={volunteer.id}`
]
]);

patch("src/app/admin/events/[id]/attendance/export/route.ts", [
[
`      .select("id, timeslot_id, volunteer_key, volunteer_name, email, mobile, tshirt_size, entry_method")`,
`      .select("id, timeslot_id, volunteer_key, volunteer_name, email, mobile, tshirt_size, dietary_requirements, entry_method")`
],
[
`      volunteer.tshirt_size,
      volunteer.entry_method === "walk_in" ? "Last-minute" : "Imported",`,
`      volunteer.tshirt_size,
      volunteer.dietary_requirements,
      volunteer.entry_method === "walk_in" ? "Last-minute" : "Imported",`
],
[
`    "tshirt_size",
    "roster_source",`,
`    "tshirt_size",
    "dietary_requirements",
    "roster_source",`
]
]);

patch("src/app/admin/events/[id]/report/export/route.ts", [
[
`      .select("id, timeslot_id, volunteer_key, volunteer_name, email, mobile, tshirt_size, entry_method, attendance_person_key")`,
`      .select("id, timeslot_id, volunteer_key, volunteer_name, email, mobile, tshirt_size, dietary_requirements, entry_method, attendance_person_key")`
],
[
`    "tshirt_size",
    "roster_source",`,
`    "tshirt_size",
    "dietary_requirements",
    "roster_source",`
],
[
`      volunteer.tshirt_size,
      volunteer.entry_method === "walk_in" ? "Last-minute" : "Imported",`,
`      volunteer.tshirt_size,
      volunteer.dietary_requirements,
      volunteer.entry_method === "walk_in" ? "Last-minute" : "Imported",`
]
]);
