#!/usr/bin/env python3
"""Resumable, search-only Apollo collector for U.S. open-to-work tech candidates.

Uses APOLLO_API_KEY from .env, but never calls Apollo enrichment/match endpoints.
It saves only non-contact search metadata and can resume after a rate-limit window.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import re
import time
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

API_URL = "https://api.apollo.io/api/v1/mixed_people/api_search"
MAX_APOLLO_PAGES = 500
SEARCH_VERSION = "us-it-open-to-work-v6-with-apollo-ids"
TECHNICAL_TITLE_GROUPS = [
    ["Software Engineer", "Full Stack Developer", "Frontend Developer", "Backend Developer", "Web Developer"],
    ["MERN Stack Developer", "Node.js Developer", "React Developer", "Angular Developer", "Vue.js Developer"],
    ["Flutter Developer", "React Native Developer", "Android Developer", "iOS Developer", "Mobile Developer"],
    ["Java Developer", "Python Developer", "C# Developer", ".NET Developer", "Golang Developer"],
    ["Data Scientist", "Data Engineer", "Machine Learning Engineer", "AI Engineer", "Analytics Engineer"],
    ["MLOps Engineer", "Data Analyst", "BI Developer", "ETL Developer", "Database Developer"],
    ["DevOps Engineer", "Cloud Engineer", "Site Reliability Engineer", "Platform Engineer", "Kubernetes Engineer"],
    ["QA Engineer", "Software Test Engineer", "Automation Engineer", "SDET", "Performance Test Engineer"],
    ["UI Designer", "UX Designer", "UI/UX Designer", "Product Designer", "UX Researcher"],
    ["Security Engineer", "Cybersecurity Engineer", "Application Security Engineer", "Network Security Engineer", "Cloud Security Engineer"],
    ["Database Administrator", "SQL Developer", "Systems Engineer", "Embedded Software Engineer", "Firmware Engineer"],
    ["IoT Engineer", "Blockchain Developer", "Game Developer", "AR/VR Developer", "Solutions Architect"],
    ["PHP Developer", "Laravel Developer", "Ruby on Rails Developer", "WordPress Developer", "Shopify Developer"],
    ["Systems Administrator", "Network Engineer", "IT Support Engineer", "IT Administrator", "Infrastructure Engineer"],
    ["SAP Consultant", "Salesforce Developer", "Dynamics 365 Developer", "ERP Consultant", "CRM Developer"],
    ["Product Manager", "Technical Product Manager", "Scrum Master", "Business Systems Analyst", "Technical Writer"],
]
OPEN_TO_WORK_VARIANTS = [
    "open to work", "open-to-work", "#opentowork", "available for work",
    "actively seeking", "actively looking", "seeking opportunities",
    "seeking new opportunities", "looking for opportunities",
    "looking for a new opportunity", "exploring new opportunities",
    "ready for next opportunity", "in transition","looking for oopourtunities",
]
OUTPUT_COLUMNS = [
    "apollo_id", "first_name", "last_name", "job_title", "headline", "company_name", "industry",
    "company_location", "employee_count", "person_location", "linkedin_url",
    "open_to_work_signal", "source",
]


def read_env_value(env_file: Path, key: str) -> str | None:
    if not env_file.exists():
        return None
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            name, value = line.split("=", 1)
            if name.strip() == key:
                return value.strip().strip('"').strip("'")
    return None


def search(api_key: str, titles: list[str], signal: str | None, page: int) -> dict[str, Any]:
    parameters: list[tuple[str, str | int]] = [
        ("page", page), ("per_page", 100), ("person_locations[]", "United States"),
        ("include_similar_titles", "true"),
    ]
    if signal:
        parameters.append(("q_keywords", signal))
    parameters.extend(("person_titles[]", title) for title in titles)
    request = Request(
        f"{API_URL}?{urlencode(parameters)}", method="POST",
        headers={"Content-Type": "application/json", "X-Api-Key": api_key},
    )
    with urlopen(request, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))


def joined_location(record: dict[str, Any]) -> str:
    return ", ".join(str(item) for item in (record.get("city"), record.get("state"), record.get("country")) if item)


def safe_record(record: dict[str, Any], signal: str) -> dict[str, str]:
    """Never write email, phone, or the raw provider payload to disk."""
    organization = record.get("organization") or {}
    return {
        "apollo_id": str(record.get("id") or ""),
        "first_name": str(record.get("first_name") or ""),
        "last_name": str(record.get("last_name") or record.get("last_name_obfuscated") or ""),
        "job_title": str(record.get("title") or ""), "headline": str(record.get("headline") or ""),
        "company_name": str(organization.get("name") or ""), "industry": str(organization.get("industry") or ""),
        "company_location": ", ".join(str(item) for item in (organization.get("city"), organization.get("state"), organization.get("country")) if item),
        "employee_count": str(organization.get("estimated_num_employees") or ""),
        "person_location": joined_location(record), "linkedin_url": str(record.get("linkedin_url") or ""),
        "open_to_work_signal": signal, "source": "apollo-search-no-enrichment",
    }


def detected_open_to_work_signal(record: dict[str, Any]) -> str | None:
    """Detect signals in search fields returned by Apollo's broad role search."""
    searchable = " ".join(str(record.get(field) or "") for field in ("title", "headline")).casefold()
    searchable = re.sub(r"[\-_/#]+", " ", searchable)
    patterns = [
        (r"\bopen\s+to\s+work\b", "open to work"),
        (r"\bopentowork\b", "open to work"),
        (r"\bavailable\s+(?:for\s+work|immediately)\b", "available for work"),
        (r"\bactively\s+(?:seeking|looking)\b", "actively seeking"),
        (r"\b(?:seeking|looking\s+for|exploring)\s+(?:new\s+)?(?:opportunities|opportunity|roles?|positions?|jobs?)\b", "seeking opportunities"),
        (r"\bready\s+for\s+(?:a\s+)?next\s+(?:opportunity|role)\b", "ready for next opportunity"),
        (r"\b(?:in\s+transition|between\s+(?:jobs|roles))\b", "in transition"),
        (r"\blooking\s+fro\s+opportunities\b", "looking for opportunities"),
    ]
    for pattern, label in patterns:
        if re.search(pattern, searchable):
            return label
    return None


def write_outputs(output_dir: Path, records: list[dict[str, str]], state: dict[str, Any]) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir / "apollo-tech-candidates.json").write_text(
        json.dumps({"progress": state, "records": records}, indent=2), encoding="utf-8"
    )
    with (output_dir / "apollo-tech-candidates.csv").open("w", encoding="utf-8", newline="") as file:
        writer = csv.DictWriter(file, fieldnames=OUTPUT_COLUMNS)
        writer.writeheader(); writer.writerows(records)
    (output_dir / "apollo-tech-candidates.state.json").write_text(json.dumps(state, indent=2), encoding="utf-8")


def load_resume(output_dir: Path) -> tuple[list[dict[str, str]], dict[str, Any]]:
    result_file = output_dir / "apollo-tech-candidates.json"
    state_file = output_dir / "apollo-tech-candidates.state.json"
    if not result_file.exists() or not state_file.exists():
        raise SystemExit("No previous run found. Run without --resume first.")
    result = json.loads(result_file.read_text(encoding="utf-8"))
    state = json.loads(state_file.read_text(encoding="utf-8"))
    if state.get("search_version") != SEARCH_VERSION:
        raise SystemExit(
            "This output folder belongs to an older search configuration. "
            "Start a new run without --resume, preferably with --output-dir output-it-roles."
        )
    return result.get("records", []), state


def main() -> None:
    parser = argparse.ArgumentParser(description="Collect U.S. open-to-work tech candidates from Apollo search.")
    parser.add_argument("--limit", type=int, default=1000, help="Maximum unique records; use 0 for no overall record cap (default: 1000)")
    parser.add_argument("--pages-per-query", type=int, default=5, help="Pages to read for each role/signal query (default: 5; max: 500)")
    parser.add_argument("--request-budget", type=int, default=450, help="Maximum API requests this run (default: 450; keep <= 600 on Free)")
    parser.add_argument("--delay-seconds", type=float, default=1.25, help="Pause between requests to stay below Free rate limits (default: 1.25)")
    parser.add_argument("--resume", action="store_true", help="Resume from saved output state")
    parser.add_argument("--output-dir", type=Path, default=Path("output"), help="Output directory")
    args = parser.parse_args()
    if args.limit < 0: parser.error("--limit must be 0 or a positive number")
    if not 1 <= args.pages_per_query <= MAX_APOLLO_PAGES: parser.error("--pages-per-query must be between 1 and 500")
    if not 1 <= args.request_budget <= 600: parser.error("--request-budget must be between 1 and 600")
    if args.delay_seconds < 1.2: parser.error("--delay-seconds must be at least 1.2")

    root = Path(__file__).resolve().parent.parent
    api_key = os.environ.get("APOLLO_API_KEY") or read_env_value(root / ".env", "APOLLO_API_KEY")
    if not api_key:
        raise SystemExit("APOLLO_API_KEY is missing. Add it to .env or set it in your environment.")

    # First, run high-precision Apollo keyword searches. Then run broad title
    # searches and locally retain only visible title/headline OTW signals.
    jobs = (
        [("apollo-keyword", signal, titles) for signal in OPEN_TO_WORK_VARIANTS for titles in TECHNICAL_TITLE_GROUPS]
        + [("headline-check", None, titles) for titles in TECHNICAL_TITLE_GROUPS]
    )
    if args.resume:
        records, state = load_resume(args.output_dir)
    else:
        records, state = [], {
            "search_version": SEARCH_VERSION, "next_job": 0, "next_page": 1,
            "requests_completed": 0, "profiles_scanned": 0, "complete": False,
        }
    # v5 runs created before this counter have no recoverable per-page counts.
    # Begin exact tracking from the next resumed request without discarding data.
    state.setdefault("profiles_scanned", 0)
    seen = {record.get("linkedin_url") or f"{record.get('first_name')}|{record.get('last_name')}|{record.get('company_name')}" for record in records}
    requests_this_run = 0

    while (
        state["next_job"] < len(jobs)
        and (args.limit == 0 or len(records) < args.limit)
        and requests_this_run < args.request_budget
    ):
        mode, signal, titles = jobs[state["next_job"]]
        page = state["next_page"]
        if requests_this_run:
            time.sleep(args.delay_seconds)
        try:
            response = search(api_key, titles, signal, page)
        except HTTPError as error:
            write_outputs(args.output_dir, records, state)
            detail = error.read().decode("utf-8", errors="replace")[:300]
            raise SystemExit(f"Apollo returned HTTP {error.code}: {detail}\nProgress was saved. Wait for the rate limit to reset, then run again with --resume.") from error
        except URLError as error:
            write_outputs(args.output_dir, records, state)
            raise SystemExit(f"Could not reach Apollo: {error.reason}. Progress was saved.") from error

        requests_this_run += 1; state["requests_completed"] += 1
        people = response.get("people") or []
        state["profiles_scanned"] += len(people)
        query_label = signal if signal else "broad title search"
        print(f"Request {requests_this_run}/{args.request_budget}: {query_label!r}, {titles[0]!r}, page {page} -> {len(people)} results")
        for person in people:
            matched_signal = signal if mode == "apollo-keyword" else detected_open_to_work_signal(person)
            if not matched_signal:
                continue
            identifier = str(person.get("id") or person.get("linkedin_url") or "")
            if not identifier or identifier in seen: continue
            seen.add(identifier); records.append(safe_record(person, matched_signal))
            if args.limit and len(records) >= args.limit: break

        # Apollo does not always include pagination.total_pages. Fall back to
        # total_entries so a missing page count never incorrectly marks page 1
        # as the final page of a large result set.
        pagination = response.get("pagination") or {}
        total_entries = int(response.get("total_entries") or pagination.get("total_entries") or 0)
        calculated_pages = (total_entries + 99) // 100
        # Some Apollo search responses omit both total_pages and total_entries.
        # In that case, continue until Apollo returns an empty page (or reaches
        # the user-selected pages-per-query ceiling) rather than ending at page 1.
        reported_pages = int(pagination.get("total_pages") or calculated_pages or args.pages_per_query)
        if not people or page >= min(reported_pages, args.pages_per_query):
            state["next_job"] += 1; state["next_page"] = 1
        else:
            state["next_page"] += 1
        write_outputs(args.output_dir, records, state)

    state["complete"] = state["next_job"] >= len(jobs) or (args.limit > 0 and len(records) >= args.limit)
    write_outputs(args.output_dir, records, state)
    print(f"\nSaved {len(records)} unique records. Requests this run: {requests_this_run}.")
    print(f"Profiles scanned since scan counting began: {state['profiles_scanned']}.")
    if state["complete"]:
        print("STATUS: COMPLETE — all configured role, signal, and page searches have finished.")
    else:
        print("STATUS: PAUSED — more searches remain.")
        print("Run again with --resume after the Apollo rate-limit window resets.")
    print(f"Inspect: {args.output_dir / 'apollo-tech-candidates.json'}")


if __name__ == "__main__":
    main()
