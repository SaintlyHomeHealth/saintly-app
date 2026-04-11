#!/usr/bin/env python3
"""
Reclassify 'Other Medical' rows in arizona_facilities_crm_clean.csv using stronger keywords.
Does not change Orthopedic, Rehab, Wound Care, or Hospice.
"""

from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "arizona_facilities_crm_clean.csv"
OUT_CORRECTED = ROOT / "corrected_facilities.csv"
OUT_RECLASS = ROOT / "reclassified_rows_only.csv"
OUT_SUMMARY = ROOT / "summary_counts_by_type.csv"

PROTECTED_TYPES = frozenset(
    {"Orthopedic", "Rehab", "Wound Care", "Hospice"}
)


def is_low_value_other_medical(name: str) -> bool:
    """Do not promote — keep as Other Medical (low-value referral)."""
    n = name.upper()
    if any(
        k in n
        for k in (
            "DIALYSIS",
            "BEHAVIORAL",
            "COUNSELING",
            "PHARMACY",
        )
    ):
        return True
    if re.search(r"\bIMAGING\b", n) or " IMAGING" in n or n.startswith("IMAGING"):
        return True
    if re.search(r"\bLAB\b", n) or "LABORATORY" in n:
        return True
    return False


def reclassify_other_medical(name: str) -> str:
    """
    Apply keyword tiers only for former Other Medical rows.
    Low-value guard already applied by caller.
    Order: specific facilities first, then Hospital (Emergency/Medical Center/ER), Rehab, Specialty, Pain.
    """
    n = name.upper()

    if "SURGERY CENTER" in n or "SURGICAL CENTER" in n:
        return "Surgery Center"

    if any(
        k in n
        for k in (
            "EMERGENCY",
            "MEDICAL CENTER",
        )
    ):
        return "Hospital"
    if re.search(r"\bER\b", n):
        return "Hospital"

    if any(
        k in n
        for k in (
            "POST ACUTE",
            "POST-ACUTE",
            "TRANSITIONAL CARE",
            "RECOVERY CARE",
        )
    ):
        return "Rehab"

    if any(
        k in n
        for k in (
            "SPINE",
            "NEURO",
            "CARDIO",
            "ONCOLOGY",
            "SPECIALTY CLINIC",
        )
    ):
        return "Specialty Medical"

    if re.search(r"\bPAIN\b", n) or "PAIN MANAGEMENT" in n:
        return "Pain Management"

    return "Other Medical"


def priority_for(facility_type: str) -> str:
    if facility_type in (
        "Hospital",
        "Skilled Nursing Facility (SNF)",
        "Rehab",
        "Orthopedic",
        "Wound Care",
        "Specialty Medical",
        "Surgery Center",
    ):
        return "High"
    if facility_type in ("Assisted Living", "Hospice", "Pain Management"):
        return "Medium"
    return "Low"


def main() -> None:
    rows: list[dict[str, str]] = []
    reclass_only: list[dict[str, str]] = []

    with SRC.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames
        if not fieldnames:
            raise SystemExit("Missing CSV header")

        for row in reader:
            name = row.get("Business Name") or ""
            old_type = (row.get("Facility Type") or "").strip()
            old_pri = (row.get("Priority") or "").strip()

            new_type = old_type
            if old_type == "Other Medical":
                if is_low_value_other_medical(name):
                    new_type = "Other Medical"
                else:
                    new_type = reclassify_other_medical(name)
            elif old_type in PROTECTED_TYPES:
                new_type = old_type  # explicit no-op
            else:
                new_type = old_type

            new_pri = priority_for(new_type)

            out_row = {
                "Business Name": name,
                "Address": row.get("Address") or "",
                "Phone Number": row.get("Phone Number") or "",
                "Facility Type": new_type,
                "Priority": new_pri,
            }
            rows.append(out_row)

            if (
                old_type == "Other Medical"
                and new_type != "Other Medical"
            ):
                reclass_only.append(
                    {
                        **out_row,
                        "Previous Facility Type": old_type,
                        "Previous Priority": old_pri,
                    }
                )

    counts = Counter(r["Facility Type"] for r in rows)

    with OUT_CORRECTED.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(
            f,
            fieldnames=[
                "Business Name",
                "Address",
                "Phone Number",
                "Facility Type",
                "Priority",
            ],
        )
        w.writeheader()
        w.writerows(rows)

    reclass_fields = [
        "Business Name",
        "Address",
        "Phone Number",
        "Facility Type",
        "Priority",
        "Previous Facility Type",
        "Previous Priority",
    ]
    with OUT_RECLASS.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=reclass_fields)
        w.writeheader()
        w.writerows(reclass_only)

    with OUT_SUMMARY.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Facility Type", "Count"])
        for ft in sorted(counts.keys()):
            w.writerow([ft, counts[ft]])

    om_before = 0
    with SRC.open(encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            if (row.get("Facility Type") or "").strip() == "Other Medical":
                om_before += 1
    om_after = counts.get("Other Medical", 0)

    print(f"Wrote {len(rows)} rows to {OUT_CORRECTED}")
    print(
        f"Reclassified from Other Medical: {len(reclass_only)} rows -> {OUT_RECLASS}"
    )
    print(f"Summary -> {OUT_SUMMARY}")
    print(f"Other Medical count: {om_before} -> {om_after}")


if __name__ == "__main__":
    main()
