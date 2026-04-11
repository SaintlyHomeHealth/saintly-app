#!/usr/bin/env python3
"""
Further refine Facility Type for rows still marked Other Medical.
Reads corrected_facilities.csv; applies low-value guards + expanded keyword promotion.
"""

from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "corrected_facilities.csv"
OUT_REFINED = ROOT / "refined_facilities.csv"
OUT_NEW_RECLASS = ROOT / "new_reclassified_rows.csv"
OUT_SUMMARY = ROOT / "updated_summary_counts.csv"


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
    Full promotion ladder for former Other Medical rows (low-value already filtered).
    """
    n = name.upper()

    if "SURGERY CENTER" in n or "SURGICAL CENTER" in n:
        return "Surgery Center"

    if any(
        k in n
        for k in (
            "EMERGENCY",
            "MEDICAL CENTER",
            "REGIONAL",
            "HEALTH CENTER",
            "MEDICAL PLAZA",
            "CAMPUS",
            "BANNER HEALTH",
            "ABRAZO",
            "HONORHEALTH",
        )
    ):
        return "Hospital"
    if re.search(r"\bER\b", n):
        return "Hospital"

    # Before Rehab (CARE CENTER) so MEMORY CARE / senior living wins over generic "Care Center"
    if any(
        k in n
        for k in (
            "ASSISTED LIVING",
            "SENIOR LIVING",
            "MEMORY CARE",
        )
    ):
        return "Assisted Living"

    if any(
        k in n
        for k in (
            "POST ACUTE",
            "POST-ACUTE",
            "TRANSITIONAL CARE",
            "RECOVERY CARE",
            "SKILLED NURSING",
            "NURSING CENTER",
            "REHABILITATION HOSPITAL",
            "HEALTH AND REHAB",
        )
    ):
        return "Rehab"
    if "CARE CENTER" in n and "URGENT CARE" not in n:
        return "Rehab"
    if re.search(r"\bSNF\b", n):
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
    if not SRC.is_file():
        raise SystemExit(f"Missing input: {SRC} (run reclassify_other_medical_facilities.py first)")

    rows: list[dict[str, str]] = []
    new_reclass: list[dict[str, str]] = []

    with SRC.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        if not reader.fieldnames:
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

            if old_type == "Other Medical" and new_type != "Other Medical":
                new_reclass.append(
                    {
                        **out_row,
                        "Previous Facility Type": old_type,
                        "Previous Priority": old_pri,
                    }
                )

    counts = Counter(r["Facility Type"] for r in rows)

    fields = [
        "Business Name",
        "Address",
        "Phone Number",
        "Facility Type",
        "Priority",
    ]
    with OUT_REFINED.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    reclass_fields = fields + ["Previous Facility Type", "Previous Priority"]
    with OUT_NEW_RECLASS.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=reclass_fields)
        w.writeheader()
        w.writerows(new_reclass)

    standard_types = [
        "Hospital",
        "Rehab",
        "Skilled Nursing Facility (SNF)",
        "Assisted Living",
        "Hospice",
        "Orthopedic",
        "Wound Care",
        "Specialty Medical",
        "Surgery Center",
        "Pain Management",
        "Other Medical",
    ]
    with OUT_SUMMARY.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Facility Type", "Count"])
        for ft in standard_types:
            w.writerow([ft, counts.get(ft, 0)])
        extra = sorted(k for k in counts if k not in standard_types)
        for ft in extra:
            w.writerow([ft, counts[ft]])

    om_in = 0
    with SRC.open(encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if (row.get("Facility Type") or "").strip() == "Other Medical":
                om_in += 1

    print(f"Wrote {len(rows)} rows -> {OUT_REFINED}")
    print(f"Newly promoted from Other Medical: {len(new_reclass)} -> {OUT_NEW_RECLASS}")
    print(f"Summary -> {OUT_SUMMARY}")
    print(f"Other Medical: {om_in} -> {counts.get('Other Medical', 0)}")


if __name__ == "__main__":
    main()
