#!/usr/bin/env python3
"""Build a zero-credit, tech-role prospect CSV from a manually exported/source CSV.

This script never calls Apollo or attempts to reveal contact information.  Feed it
only data you are permitted to use (for example, a manually collected company or
public-profile CSV) and it will retain rows whose title/headline/description match
technology roles.
"""

from __future__ import annotations

import argparse
import csv
import re
from pathlib import Path


TECH_ROLE_PATTERN = re.compile(
    r"\b(?:"
    r"java(?:\s+(?:developer|engineer))?|"
    r"python(?:\s+(?:developer|engineer))?|"
    r"full[ -]?stack(?:\s+(?:developer|engineer))?|"
    r"(?:front[ -]?end|back[ -]?end)(?:\s+(?:developer|engineer))?|"
    r"software(?:\s+(?:developer|engineer))?|"
    r"(?:web|mobile|android|ios|react|node(?:\.js)?|javascript|typescript|"
    r"php|\.net|c#|golang|ruby|data|devops|cloud|machine learning|ml)"
    r"\s*(?:developer|engineer|scientist|architect)?"
    r")\b",
    re.IGNORECASE,
)

# Output deliberately excludes email, phone, and private/enriched contact fields.
OUTPUT_COLUMNS = [
    "first_name",
    "last_name",
    "job_title",
    "headline",
    "job_description",
    "seniority",
    "company_name",
    "company_website",
    "company_domain",
    "industry",
    "company_location",
    "employee_range",
    "person_location",
    "linkedin_url",
    "source",
]

ALIASES = {
    "job_title": ("job_title", "title", "position", "role"),
    "job_description": ("job_description", "description", "summary", "about"),
    "company_name": ("company_name", "company", "organization", "account_name"),
    "company_website": ("company_website", "website", "company_url"),
    "company_domain": ("company_domain", "domain"),
    "company_location": ("company_location", "location", "company_city"),
    "person_location": ("person_location", "person_country", "country", "city"),
}


def value(row: dict[str, str], field: str) -> str:
    """Return a normalized field, accepting common CSV heading alternatives."""
    for name in ALIASES.get(field, (field,)):
        if row.get(name):
            return row[name].strip()
    return row.get(field, "").strip()


def is_tech_role(row: dict[str, str]) -> bool:
    searchable_text = " ".join(
        value(row, field)
        for field in ("job_title", "headline", "job_description")
    )
    return bool(TECH_ROLE_PATTERN.search(searchable_text))


def transform(row: dict[str, str], source: str) -> dict[str, str]:
    return {
        "first_name": row.get("first_name", "").strip(),
        "last_name": row.get("last_name", "").strip(),
        "job_title": value(row, "job_title"),
        "headline": row.get("headline", "").strip(),
        "job_description": value(row, "job_description"),
        "seniority": row.get("seniority", "").strip(),
        "company_name": value(row, "company_name"),
        "company_website": value(row, "company_website"),
        "company_domain": value(row, "company_domain"),
        "industry": row.get("industry", "").strip(),
        "company_location": value(row, "company_location"),
        "employee_range": row.get("employee_range", "").strip(),
        "person_location": value(row, "person_location"),
        "linkedin_url": row.get("linkedin_url", "").strip(),
        "source": source,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Filter permitted source data to tech roles.")
    parser.add_argument("input", type=Path, help="Source CSV collected without revealing Apollo contact data")
    parser.add_argument("output", type=Path, help="Destination CSV")
    parser.add_argument("--source", default="manual-public-research", help="Provenance label written to every row")
    args = parser.parse_args()

    with args.input.open("r", encoding="utf-8-sig", newline="") as input_file:
        rows = list(csv.DictReader(input_file))

    matches = [transform(row, args.source) for row in rows if is_tech_role(row)]
    args.output.parent.mkdir(parents=True, exist_ok=True)
    with args.output.open("w", encoding="utf-8", newline="") as output_file:
        writer = csv.DictWriter(output_file, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader()
        writer.writerows(matches)

    print(f"Wrote {len(matches)} tech-role rows from {len(rows)} input rows to {args.output}")


if __name__ == "__main__":
    main()
