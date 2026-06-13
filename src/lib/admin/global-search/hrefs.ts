export function globalSearchHref(type: string, id: string): string {
  switch (type) {
    case "lead":
      return `/admin/crm/leads/${id}`;
    case "patient":
      return `/admin/crm/patients/${id}`;
    case "contact":
      return `/admin/crm/contacts/${id}`;
    case "call":
      return `/admin/phone/${id}`;
    case "private_pay":
      return `/admin/private-pay?invoice=${encodeURIComponent(id)}`;
    case "fax":
      return `/admin/fax/${id}`;
    case "packet":
      return `/admin/signatures/packets/${encodeURIComponent(id)}`;
    case "applicant":
      return `/admin/onboarding/${id}`;
    case "recruit":
      return `/admin/recruiting/${id}`;
    case "inbound_email":
      return `/admin/crm/leads?tab=all&q=${encodeURIComponent(id.slice(0, 8))}`;
    case "facility":
      return `/admin/facilities/${id}`;
    case "crm_task":
      return `/admin/crm/tasks?task=${encodeURIComponent(id)}`;
    case "conversation":
      return `/admin/phone/messages/${id}`;
    default:
      return "/admin/search";
  }
}

export function globalSearchTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    lead: "Lead",
    patient: "Patient",
    contact: "Contact",
    call: "Call",
    private_pay: "Private Pay",
    fax: "Fax",
    packet: "Packet",
    applicant: "Applicant",
    recruit: "Recruit",
    inbound_email: "Inbound Email",
    facility: "Facility",
    crm_task: "Task",
    conversation: "SMS Thread",
  };
  return labels[type] ?? type;
}
