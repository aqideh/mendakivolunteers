"use client";

import { useState } from "react";

import styles from "../professionals/professionals.module.css";

export type ProfessionalNetworkEventCard = Readonly<{
  id: string;
  title: string;
  summary: string | null;
  dateLabel: string;
  startsAt: string | null;
  endsAt: string | null;
  venue: string | null;
  ctaLabel: string;
  ctaUrl: string | null;
}>;

const professionalNetworks = [
  {
    name: "Aerospace and Aviation",
    linkedinUrl: "https://www.linkedin.com/groups/14406677/",
  },
  {
    name: "Banking & Finance",
    linkedinUrl: "https://www.linkedin.com/groups/14161777/",
  },
  {
    name: "Early Childhood",
    linkedinUrl: "https://www.linkedin.com/groups/14290278/",
  },
  {
    name: "Education",
    linkedinUrl: "https://www.linkedin.com/groups/36980182/",
  },
  {
    name: "Engineering",
    linkedinUrl: "https://www.linkedin.com/groups/14237296/",
  },
  {
    name: "Entrepreneurship",
    linkedinUrl: "https://www.linkedin.com/groups/23250004/",
  },
  {
    name: "Healthcare",
    linkedinUrl: "https://www.linkedin.com/groups/14276878/",
  },
  {
    name: "Human Resources",
    linkedinUrl: "https://www.linkedin.com/groups/14289305/",
  },
  {
    name: "Legal",
    linkedinUrl: "https://www.linkedin.com/groups/14249872/",
  },
  {
    name: "Life Sciences",
    linkedinUrl: "https://www.linkedin.com/groups/14115620/",
  },
  {
    name: "Media & Creatives",
    linkedinUrl: "https://www.linkedin.com/groups/14284323/",
  },
  {
    name: "Public Sector",
    linkedinUrl: "https://www.linkedin.com/groups/14288321/",
  },
  {
    name: "Social Services",
    linkedinUrl: "https://www.linkedin.com/groups/14284320/",
  },
  {
    name: "Sports",
    linkedinUrl: "https://www.linkedin.com/groups/14288285/",
  },
  {
    name: "Sustainability",
    linkedinUrl: "https://www.linkedin.com/groups/14287266/",
  },
  {
    name: "Tech",
    linkedinUrl: "https://www.linkedin.com/groups/14502157/",
  },
] as const;

type TabKey = "directory" | "upcoming" | "past";

function EventGrid({
  events,
  mode,
}: Readonly<{
  events: readonly ProfessionalNetworkEventCard[];
  mode: "upcoming" | "past";
}>) {
  if (events.length === 0) {
    return (
      <div className={styles.emptyState}>
        {mode === "upcoming"
          ? "No upcoming Professional Network events are published right now."
          : "No past Professional Network events are available yet."}
      </div>
    );
  }

  return (
    <div className={styles.eventGrid}>
      {events.map((event) => (
        <article className={styles.eventCard} key={event.id}>
          <div className={styles.eventMeta}>
            <span>{event.dateLabel}</span>
            {event.venue ? <span>{event.venue}</span> : null}
          </div>
          <h3>{event.title}</h3>
          <p>{event.summary}</p>
          {mode === "upcoming" ? (
            event.ctaUrl ? (
              <a
                className={styles.eventCta}
                href={event.ctaUrl}
                target="_blank"
                rel="noreferrer"
              >
                <span>{event.ctaLabel}</span>
                <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <button className={styles.deadCta} type="button" disabled aria-disabled="true">
                <span>{event.ctaLabel}</span>
                <span aria-hidden="true">↗</span>
              </button>
            )
          ) : null}
        </article>
      ))}
    </div>
  );
}

export function ProfessionalNetworkTabs({
  upcomingEvents,
  pastEvents,
}: Readonly<{
  upcomingEvents: readonly ProfessionalNetworkEventCard[];
  pastEvents: readonly ProfessionalNetworkEventCard[];
}>) {
  const [activeTab, setActiveTab] = useState<TabKey>("directory");

  return (
    <section
      className={`${styles.eventsSection} phaseone-opportunities-peek`}
      aria-label="Professional Networks directory and events"
    >
      <aside className={styles.networkInfoBox}>
        <p>
          The MENDAKI Professional Networks (PN) is a platform that connects and empowers
          professionals within the Malay/Muslim community to nurture leadership, foster
          collaboration and accelerate collective success. Through industry-focused initiatives,
          networking opportunities and knowledge sharing, PN enables members to build meaningful
          connections, support one another&apos;s growth and contribute back to the community.
        </p>
      </aside>

      <div className={styles.tabList} role="tablist" aria-label="Professional Networks">
        <button
          id="professional-networks-directory-tab"
          className={`${styles.tabButton} ${
            activeTab === "directory" ? styles.tabButtonActive : ""
          }`}
          type="button"
          role="tab"
          aria-selected={activeTab === "directory"}
          aria-controls="professional-networks-directory-panel"
          onClick={() => setActiveTab("directory")}
        >
          <span>Directory</span>
          <span className={styles.tabCount}>{professionalNetworks.length}</span>
        </button>

        <button
          id="professional-networks-upcoming-tab"
          className={`${styles.tabButton} ${
            activeTab === "upcoming" ? styles.tabButtonActive : ""
          }`}
          type="button"
          role="tab"
          aria-selected={activeTab === "upcoming"}
          aria-controls="professional-networks-upcoming-panel"
          onClick={() => setActiveTab("upcoming")}
        >
          <span>Upcoming Events</span>
          <span className={styles.tabCount}>{upcomingEvents.length}</span>
        </button>

        <button
          id="professional-networks-past-tab"
          className={`${styles.tabButton} ${
            activeTab === "past" ? styles.tabButtonActive : ""
          }`}
          type="button"
          role="tab"
          aria-selected={activeTab === "past"}
          aria-controls="professional-networks-past-panel"
          onClick={() => setActiveTab("past")}
        >
          <span>Past Events</span>
          <span className={styles.tabCount}>{pastEvents.length}</span>
        </button>
      </div>

      {activeTab === "directory" ? (
        <div
          className={styles.tabPanel}
          id="professional-networks-directory-panel"
          role="tabpanel"
          aria-labelledby="professional-networks-directory-tab"
          tabIndex={0}
          key="directory"
        >
          <div className={styles.directoryGrid}>
            {professionalNetworks.map((network) => (
              <article className={styles.networkCard} key={network.name}>
                <span className={styles.networkLabel}>Professional Network</span>
                <h3>{network.name}</h3>
                <a
                  className={styles.networkLink}
                  href={network.linkedinUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  <span>Visit LinkedIn</span>
                  <span aria-hidden="true">↗</span>
                </a>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {activeTab === "upcoming" ? (
        <div
          className={styles.tabPanel}
          id="professional-networks-upcoming-panel"
          role="tabpanel"
          aria-labelledby="professional-networks-upcoming-tab"
          tabIndex={0}
          key="upcoming"
        >
          <EventGrid events={upcomingEvents} mode="upcoming" />
        </div>
      ) : null}

      {activeTab === "past" ? (
        <div
          className={styles.tabPanel}
          id="professional-networks-past-panel"
          role="tabpanel"
          aria-labelledby="professional-networks-past-tab"
          tabIndex={0}
          key="past"
        >
          <EventGrid events={pastEvents} mode="past" />
        </div>
      ) : null}
    </section>
  );
}
