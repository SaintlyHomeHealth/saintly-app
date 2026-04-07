"use client";

import { useState } from "react";
import { EMAIL_INTAKE } from "./marketing-constants";
import { CONTACT_RELATION_OPTIONS, CONTACT_SERVICE_OPTIONS } from "@/lib/marketing/contact-intake-mailto";
import { SMS_CONSENT_CHECKBOX_LABEL, SMS_CONSENT_PURCHASE_NOTE } from "@/lib/marketing/sms-consent-copy";

export function MarketingContactForm() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [relation, setRelation] = useState<string>(CONTACT_RELATION_OPTIONS[0].value);
  const [service, setService] = useState<string>(CONTACT_SERVICE_OPTIONS[0].value);
  const [message, setMessage] = useState("");
  const [smsConsent, setSmsConsent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setNotice(null);

    if (!smsConsent) {
      setNotice("Please check the SMS consent box to continue—we need your agreement before we can follow up by text.");
      return;
    }

    setPending(true);
    try {
      const res = await fetch("/api/contact-intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          phone,
          email,
          relation,
          service,
          message,
          sms_consent: true,
        }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string; mailtoHref?: string };

      if (!res.ok || !data.ok || !data.mailtoHref) {
        const err = data.error;
        if (err === "sms_consent_required") {
          setNotice("SMS consent is required to submit this form.");
        } else if (err === "validation_name") {
          setNotice("Please enter your name so we can follow up.");
        } else if (err === "message_too_long") {
          setNotice("Message is a bit long—please shorten it or call us directly.");
        } else {
          setNotice("Something went wrong. Please try again or call us.");
        }
        return;
      }

      window.location.href = data.mailtoHref;
    } catch {
      setNotice("We could not reach the server. Check your connection and try again.");
    } finally {
      setPending(false);
    }
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
            {CONTACT_RELATION_OPTIONS.map((o) => (
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
            {CONTACT_SERVICE_OPTIONS.map((o) => (
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
        Submitting opens your email app to send a message to {EMAIL_INTAKE}. If nothing opens, call us or email us
        directly.
      </p>

      <div className="shh-sms-consent">
        <label htmlFor="intake-sms-consent" className="shh-sms-consent__label">
          <input
            id="intake-sms-consent"
            name="sms_consent"
            type="checkbox"
            checked={smsConsent}
            onChange={(e) => setSmsConsent(e.target.checked)}
            className="shh-sms-consent__input"
          />
          <span className="shh-sms-consent__text">{SMS_CONSENT_CHECKBOX_LABEL}</span>
        </label>
        <p className="shh-sms-consent__note">{SMS_CONSENT_PURCHASE_NOTE}</p>
      </div>

      <div className="shh-form-actions">
        <button type="submit" className="shh-btn-primary shh-btn-primary--form" disabled={pending || !smsConsent}>
          {pending ? "Preparing message…" : "Send intake message"}
        </button>
      </div>
    </form>
  );
}
