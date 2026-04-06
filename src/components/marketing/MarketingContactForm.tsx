"use client";

import { useState } from "react";
import { EMAIL_INTAKE, MAILTO_INTAKE } from "./marketing-constants";

const RELATION_OPTIONS = [
  { value: "self", label: "Patient / self" },
  { value: "family", label: "Family member" },
  { value: "referral", label: "Referral source (physician, hospital, etc.)" },
] as const;

const SERVICE_OPTIONS = [
  { value: "general", label: "General question" },
  { value: "wound", label: "Wound care" },
  { value: "nursing", label: "Skilled nursing" },
  { value: "therapy", label: "Therapy (PT / OT / ST)" },
] as const;

export function MarketingContactForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState<string>(RELATION_OPTIONS[0].value);
  const [service, setService] = useState<string>(SERVICE_OPTIONS[0].value);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setNotice("Please enter your name so we can follow up.");
      return;
    }

    const relLabel = RELATION_OPTIONS.find((r) => r.value === relation)?.label ?? relation;
    const svcLabel = SERVICE_OPTIONS.find((s) => s.value === service)?.label ?? service;

    const bodyLines = [
      `Name: ${trimmedName}`,
      `Phone: ${phone.trim() || "—"}`,
      `Email: ${email.trim() || "—"}`,
      `I am: ${relLabel}`,
      `Service needed: ${svcLabel}`,
      "",
      message.trim() || "(no additional message)",
    ];

    const subject = encodeURIComponent("Intake inquiry — Saintly Home Health");
    const body = encodeURIComponent(bodyLines.join("\n"));
    const href = `${MAILTO_INTAKE}?subject=${subject}&body=${body}`;

    if (href.length > 1800) {
      setNotice("Message is a bit long—please shorten it or call us directly.");
      return;
    }

    window.location.href = href;
  }

  return (
    <form className="shh-intake-form" onSubmit={handleSubmit} noValidate>
      {notice ? (
        <p className="shh-form-notice" role="status">
          {notice}
        </p>
      ) : null}

      <div className="shh-field">
        <label htmlFor="intake-name">Name *</label>
        <input
          id="intake-name"
          name="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Full name"
          required
        />
      </div>

      <div className="shh-field-row">
        <div className="shh-field">
          <label htmlFor="intake-phone">Phone</label>
          <input
            id="intake-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Best number to reach you"
          />
        </div>
        <div className="shh-field">
          <label htmlFor="intake-email">Email</label>
          <input
            id="intake-email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
          />
        </div>
      </div>

      <div className="shh-field-row">
        <div className="shh-field">
          <label htmlFor="intake-relation">I am</label>
          <select
            id="intake-relation"
            name="relation"
            value={relation}
            onChange={(e) => setRelation(e.target.value)}
          >
            {RELATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="shh-field">
          <label htmlFor="intake-service">Service needed</label>
          <select
            id="intake-service"
            name="service"
            value={service}
            onChange={(e) => setService(e.target.value)}
          >
            {SERVICE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="shh-field">
        <label htmlFor="intake-message">Message</label>
        <textarea
          id="intake-message"
          name="message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Tell us briefly what you need—recent discharge, wound concerns, therapy goals, etc."
        />
      </div>

      <p className="shh-form-hint">
        Submitting opens your email app to send a message to {EMAIL_INTAKE}. If nothing opens, call us or
        email us directly.
      </p>

      <div className="shh-form-actions">
        <button type="submit" className="shh-btn-primary shh-btn-primary--form">
          Send intake message
        </button>
      </div>
    </form>
  );
}
