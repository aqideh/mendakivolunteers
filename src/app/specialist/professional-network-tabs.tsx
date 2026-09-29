"use client";

import { useState } from "react";

import styles from "../professionals/professionals.module.css";

export type ProfessionalNetworkEventCard = Readonly<{
  id: string;
  title: string;
  summary: string | null;
  dateLabel: string;
  venue: string | null;
  ctaLabel: string;
  ctaUrl: string | null;
}>;

const professionalNetworks = [
  {
    name: "PN for Aerospace and Aviation",
    linkedinUrl: "https://www.linkedin.com/groups/14406677/",
  },
  {
    name: "PN for Banking & Finance",
    linkedinUrl: "https://www.linkedin.com/groups/14161777/",
  },
  {
    name: "PN for Early Childhood",
    linkedinUrl: "https://www.linkedin.com/groups/14290278/",
  },
  {
    name: "PN for Education",
    linkedinUrl: "https://www.linkedin.com/groups/36980182/",
  },
  {
    name: "PN for Engineering",
    linkedinUrl: "https://www.linkedin.com/groups/14237296/",
  },
  {
    name: "PN for Entrepreneurship",
    linkedinUrl: "https://www.linkedin.com/groups/23250004/",
  },
  {
    name: "PN for Healthcare",
    linkedinUrl: "https://www.linkedin.com/groups/14276878/",
  },
  {
    name: "PN for Human Resources",
    linkedinUrl: "https://www.linkedin.com/groups/14289305/",
  },
  {
    name: "PN for Legal",
    linkedinUrl: "https://www.linkedin.com/groups/14249872/",
  },
  {
    name: "PN for Life Sciences",
    linkedinUrl: "https://www.linkedin.com/groups/14115620/",
  },
  {
    name: "PN for Media & Creatives",
    linkedinUrl: "https://www.linkedin.com/groups/14284323/",
  },
  {
    name: "PN for Public Sector",
    linkedinUrl: "https://www.linkedin.com/groups/14288321/",
  },
  {
    name: "PN for Social Services",
    linkedinUrl: "https://www.linkedin.com/groups/14284320/",
  },
  {
    name: "PN for Sports",
    linkedinUrl: "https://www.linkedin.com/groups/14288285/",
  },
  {
    name: "PN for Sustainability",
    linkedinUrl: "https://www.linkedin.com/groups/14287266/",
  },
  {
    name: "PN for Technology",
    linkedinUrl: "https://www.linkedin.com/groups/14502157/",
  },
] as const;

type TabKey = "directory" | "events";

export function ProfessionalNetworkTabs({
  events,
}: Readonly<{
  events: readonly ProfessionalNetworkEventCard[];
}>) {
  const [activeTab, setActiveTab] = useState<TabKey>("directory");

  return (
    <section
      className={`${styles.eventsSection} phaseone-opportunities-peek`}
      aria-label="Professional Networks directory and events"
    >
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
          id="professional-networks-events-tab"
          className={`${styles.tabButton} ${
            activeTab === "events" ? styles.tabButtonActive : ""
          }`}
          type="button"
          role="tab"
          aria-selected={activeTab === "events"}
          aria-controls="professional-networks-events-panel"
          onClick={() => setActiveTab("events")}
        >
          <span>Events</span>
          <span className={styles.tabCount}>{events.length}</span>
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
      ) : (
        <div
          className={styles.tabPanel}
          id="professional-networks-events-panel"
          role="tabpanel"
          aria-labelledby="professional-networks-events-tab"
          tabIndex={0}
          key="events"
        >
          {events.length > 0 ? (
            <div className={styles.eventGrid}>
              {events.map((event) => (
                <article className={styles.eventCard} key={event.id}>
                  <div className={styles.eventMeta}>
                    <span>{event.dateLabel}</span>
                    {event.venue ? <span>{event.venue}</span> : null}
                  </div>
                  <h3>{event.title}</h3>
                  <p>{event.summary}</p>
                  {event.ctaUrl ? (
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
                  )}
                </article>
              ))}
            </div>
          ) : (
            <div className={styles.emptyState}>New Professional Network events will appear here.</div>
          )}
        </div>
      )}
    </section>
  );
}
