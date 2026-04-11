#!/usr/bin/env python3
"""
Map refined facility types + names to exact CRM UI dropdown categories.
Reads refined_facilities.csv -> final_facilities_mapped.csv + mapping_summary.csv
"""

from __future__ import annotations

import csv
import re
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "refined_facilities.csv"
OUT_FINAL = ROOT / "final_facilities_mapped.csv"
OUT_SUMMARY = ROOT / "mapping_summary.csv"


def snf_like(name_u: str) -> bool:
    return bool(
        any(
            k in name_u
            for k in (
                "SKILLED NURSING",
                "NURSING CENTER",
                "NURSING FACILITY",
                "LONG TERM CARE",
                "LONG-TERM CARE",
                "POST ACUTE",
                "POST-ACUTE",
                "TRANSITIONAL CARE",
                "RECOVERY CARE",
                "REHABILITATION HOSPITAL",
                "HEALTH AND REHAB",
            )
        )
        or re.search(r"\bSNF\b", name_u)
        or ("CARE CENTER" in name_u and "URGENT CARE" not in name_u)
    )


def map_rehab(name_u: str) -> str:
    if "HOSPITAL" in name_u:
        return "Rehab Hospital"
    if snf_like(name_u):
        return "Skilled Nursing Facility"
    return "Rehab Hospital"


def surgery_center_to_ui(name_u: str) -> str:
    if any(
        k in name_u
        for k in (
            "ORTHOPEDIC",
            "ORTHO ",
            " ORTHO",
            "SPINE",
            "JOINT",
            "MUSCULOSKELETAL",
        )
    ) or re.search(r"\bORTHO\b", name_u):
        return "Orthopedic Office"
    return "Primary Care Office"


def map_specialty_medical(name_u: str) -> str:
    if "CARDIO" in name_u or "CARDIAC" in name_u:
        return "Cardiology Office"
    if "NEURO" in name_u:
        return "Neurology Office"
    if "ONCOLOGY" in name_u or "CANCER" in name_u:
        return "Oncology Office"
    if "PODIATRY" in name_u:
        return "Podiatry Office"
    if "NEPHRO" in name_u:
        return "Nephrology Office"
    if "PULMONARY" in name_u or "PULMO" in name_u:
        return "Pulmonology Office"
    return "Primary Care Office"


def map_other_medical(name_u: str) -> str:
    if "INTERNAL MEDICINE" in name_u:
        return "Primary Care Office"
    if "FAMILY PRACTICE" in name_u or "FAMILY MEDICINE" in name_u:
        return "Primary Care Office"
    if "GERIATRIC" in name_u:
        return "Primary Care Office"
    if "CASE MANAGEMENT" in name_u:
        return "Case Management Office"
    if "HOME VISIT" in name_u or "HOME VISITS" in name_u:
        return "Home Visit Physician Group"
    return "Other"


def map_row(facility_type: str, name: str) -> str:
    t = (facility_type or "").strip()
    n = name.upper()

    if t == "Hospital":
        return "Hospital"

    if t == "Rehab":
        return map_rehab(n)

    if t == "Wound Care":
        return "Wound Clinic"

    if t == "Orthopedic":
        return "Orthopedic Office"

    if t == "Surgery Center":
        return surgery_center_to_ui(n)

    if t == "Specialty Medical":
        return map_specialty_medical(n)

    if t == "Pain Management":
        return "Pain Management"

    if t == "Hospice":
        return "Hospice"

    if t == "Other Medical":
        return map_other_medical(n)

    if t == "Assisted Living":
        return "Assisted Living"

    if t == "Skilled Nursing Facility (SNF)" or t == "Skilled Nursing Facility":
        return "Skilled Nursing Facility"

    if t == "Independent Living":
        return "Independent Living"

    # Fallback: unknown incoming type
    return "Other"


def main() -> None:
    if not SRC.is_file():
        raise SystemExit(f"Missing {SRC}")

    rows: list[dict[str, str]] = []
    with SRC.open(newline="", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            name = row.get("Business Name") or ""
            old_type = (row.get("Facility Type") or "").strip()
            new_type = map_row(old_type, name)
            rows.append(
                {
                    "Business Name": name,
                    "Address": row.get("Address") or "",
                    "Phone Number": row.get("Phone Number") or "",
                    "Facility Type": new_type,
                    "Priority": row.get("Priority") or "",
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
    with OUT_FINAL.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields)
        w.writeheader()
        w.writerows(rows)

    # Order matches CRM UI dropdown inventory (Hospice kept per mapping rule 8).
    ui_inventory = [
        "Hospital",
        "Rehab Hospital",
        "Skilled Nursing Facility",
        "Assisted Living",
        "Independent Living",
        "Wound Clinic",
        "Primary Care Office",
        "Cardiology Office",
        "Neurology Office",
        "Orthopedic Office",
        "Podiatry Office",
        "Nephrology Office",
        "Pulmonology Office",
        "Oncology Office",
        "Pain Management",
        "Case Management Office",
        "Home Visit Physician Group",
        "Hospice",
        "Other",
    ]
    with OUT_SUMMARY.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["Facility Type", "Count"])
        for ft in ui_inventory:
            w.writerow([ft, counts.get(ft, 0)])
        extra = sorted(k for k in counts if k not in ui_inventory)
        for ft in extra:
            w.writerow([ft, counts[ft]])

    print(f"Wrote {len(rows)} rows -> {OUT_FINAL}")
    print(f"Summary -> {OUT_SUMMARY} ({len(counts)} non-zero types)")


if __name__ == "__main__":
    main()
