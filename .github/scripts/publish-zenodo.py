#!/usr/bin/env python3
"""Publish dicompare library schemas to Zenodo and maintain a DOI mapping.

For each schema listed in ``index.json`` this script:

* computes a SHA-256 checksum of the schema file and skips it when the checksum
  already matches the entry in ``doi-mapping.json`` (no API calls made);
* creates a brand new Zenodo deposition for schemas it has never published, or a
  *new version* of the existing record when the content changed (this keeps a
  stable concept DOI across versions);
* uploads the JSON file, sets metadata whose description links back to the
  dicompare schema page, and publishes the record;
* records the concept DOI, version DOI and checksum in ``doi-mapping.json``.

Only the Python standard library is used so it runs anywhere with python3.

The mapping file is the authoritative record of what has been published. If a
single schema fails the script logs a warning, continues with the rest, and
exits non-zero so CI surfaces the failure while still committing partial
progress.
"""

import argparse
import datetime
import hashlib
import json
import os
import sys
import urllib.error
import urllib.request

DEFAULT_KEYWORDS = ["dicompare", "DICOM", "MRI", "quality assurance", "validation"]
DEFAULT_LICENSE = "cc-by-4.0"


def log(message):
    print(message, flush=True)


def warn(message):
    print(f"WARNING: {message}", file=sys.stderr, flush=True)


def api_request(url, token, method="GET", data=None, headers=None, expect_json=True):
    """Make a Zenodo API request and return the parsed JSON response."""
    req_headers = {"Authorization": f"Bearer {token}"}
    body = None
    if data is not None and not isinstance(data, (bytes, bytearray)):
        body = json.dumps(data).encode("utf-8")
        req_headers["Content-Type"] = "application/json"
    elif data is not None:
        body = data
    if headers:
        req_headers.update(headers)

    request = urllib.request.Request(url, data=body, method=method, headers=req_headers)
    try:
        with urllib.request.urlopen(request) as response:
            payload = response.read()
    except urllib.error.HTTPError as err:
        detail = err.read().decode("utf-8", "replace")
        raise RuntimeError(f"{method} {url} failed ({err.code}): {detail}") from err
    if not expect_json:
        return payload
    if not payload:
        return {}
    return json.loads(payload.decode("utf-8"))


def compute_checksum(path):
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for chunk in iter(lambda: handle.read(65536), b""):
            digest.update(chunk)
    return f"sha256:{digest.hexdigest()}"


def build_metadata(schema, slug, site_base_url):
    name = schema.get("name") or slug
    version = str(schema.get("version") or "1.0")
    description = schema.get("description") or ""
    authors = schema.get("authors") or []
    page_url = f"{site_base_url}/schema/{slug}"

    creators = [{"name": author} for author in authors if author] or [{"name": "dicompare"}]
    backlink = (
        f"{description}<br><br>"
        f"This is a dicompare validation schema. View, browse, and use it at "
        f'<a href="{page_url}">{page_url}</a>.'
    )
    return {
        "metadata": {
            "title": f"dicompare schema: {name} (v{version})",
            "upload_type": "dataset",
            "description": backlink,
            "creators": creators,
            "version": version,
            "keywords": DEFAULT_KEYWORDS,
            "related_identifiers": [
                {
                    "identifier": page_url,
                    "relation": "isDocumentedBy",
                    "scheme": "url",
                }
            ],
            "license": DEFAULT_LICENSE,
        }
    }


def get_draft_deposition(base_url, token, slug, existing):
    """Return (deposition, record_id_of_concept) for a new record or new version."""
    if existing and existing.get("record_id"):
        # Create a new version of the published record.
        record_id = existing["record_id"]
        action_url = f"{base_url}/api/deposit/depositions/{record_id}/actions/newversion"
        result = api_request(action_url, token, method="POST")
        draft_url = result["links"]["latest_draft"]
        deposition = api_request(draft_url, token)
        # Remove files carried over from the previous version.
        for existing_file in deposition.get("files", []):
            file_id = existing_file.get("id")
            if file_id:
                delete_url = (
                    f"{base_url}/api/deposit/depositions/{deposition['id']}/files/{file_id}"
                )
                api_request(delete_url, token, method="DELETE", expect_json=False)
        return deposition
    # Brand new deposition.
    create_url = f"{base_url}/api/deposit/depositions"
    return api_request(create_url, token, method="POST", data={})


def upload_file(base_url, token, deposition, file_path, filename):
    bucket_url = deposition.get("links", {}).get("bucket")
    with open(file_path, "rb") as handle:
        file_bytes = handle.read()
    if bucket_url:
        url = f"{bucket_url}/{filename}"
        api_request(
            url,
            token,
            method="PUT",
            data=file_bytes,
            headers={"Content-Type": "application/octet-stream"},
        )
        return
    # Fallback to the (deprecated) files API with multipart encoding.
    boundary = "----dicompareZenodoBoundary"
    parts = [
        f"--{boundary}",
        f'Content-Disposition: form-data; name="name"',
        "",
        filename,
        f"--{boundary}",
        f'Content-Disposition: form-data; name="file"; filename="{filename}"',
        "Content-Type: application/octet-stream",
        "",
    ]
    body = "\r\n".join(parts).encode("utf-8") + b"\r\n" + file_bytes
    body += f"\r\n--{boundary}--\r\n".encode("utf-8")
    files_url = f"{base_url}/api/deposit/depositions/{deposition['id']}/files"
    api_request(
        files_url,
        token,
        method="POST",
        data=body,
        headers={"Content-Type": f"multipart/form-data; boundary={boundary}"},
    )


def publish_schema(base_url, site_base_url, token, schema_path, slug, existing):
    with open(schema_path, "r", encoding="utf-8") as handle:
        schema = json.load(handle)

    deposition = get_draft_deposition(base_url, token, slug, existing)
    deposition_id = deposition["id"]

    upload_file(base_url, token, deposition, schema_path, f"{slug}.json")

    metadata = build_metadata(schema, slug, site_base_url)
    update_url = f"{base_url}/api/deposit/depositions/{deposition_id}"
    api_request(update_url, token, method="PUT", data=metadata)

    publish_url = f"{base_url}/api/deposit/depositions/{deposition_id}/actions/publish"
    published = api_request(publish_url, token, method="POST")

    meta = published.get("metadata", {})
    concept_doi = meta.get("conceptdoi") or published.get("conceptdoi")
    version_doi = meta.get("doi") or published.get("doi")
    concept_recid = published.get("conceptrecid")
    record_id = published.get("record_id") or published.get("id")
    zenodo_url = published.get("links", {}).get("record_html") or published.get(
        "links", {}
    ).get("html")

    return {
        "concept_doi": concept_doi,
        "version_doi": version_doi,
        "concept_recid": str(concept_recid) if concept_recid is not None else None,
        "record_id": str(record_id) if record_id is not None else None,
        "zenodo_url": zenodo_url,
        "version": str(schema.get("version") or "1.0"),
    }


def load_json(path, default):
    if not os.path.exists(path):
        return default
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def main():
    parser = argparse.ArgumentParser(description="Publish dicompare schemas to Zenodo.")
    parser.add_argument("--schemas-dir", default="public/schemas")
    parser.add_argument("--index", default="public/schemas/index.json")
    parser.add_argument("--mapping", default="public/schemas/doi-mapping.json")
    parser.add_argument("--zenodo-token", default=os.environ.get("ZENODO_TOKEN"))
    parser.add_argument("--zenodo-base-url", default="https://sandbox.zenodo.org")
    parser.add_argument("--site-base-url", default="https://dicompare.neurodesk.org")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Report what would be published without calling Zenodo.",
    )
    args = parser.parse_args()

    if not args.zenodo_token and not args.dry_run:
        parser.error("A Zenodo token is required (use --zenodo-token or ZENODO_TOKEN).")

    base_url = args.zenodo_base_url.rstrip("/")
    site_base_url = args.site_base_url.rstrip("/")

    index = load_json(args.index, [])
    mapping = load_json(args.mapping, {})
    now = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")

    published_count = 0
    skipped_count = 0
    failures = 0

    for ref in index:
        filename = os.path.basename(ref)
        slug = filename[:-5] if filename.endswith(".json") else filename
        schema_path = os.path.join(args.schemas_dir, filename)
        if not os.path.exists(schema_path):
            warn(f"{slug}: file {schema_path} not found, skipping")
            failures += 1
            continue

        checksum = compute_checksum(schema_path)
        existing = mapping.get(slug)
        if existing and existing.get("checksum") == checksum:
            log(f"{slug}: unchanged, skipping")
            skipped_count += 1
            continue

        if args.dry_run:
            action = "update (new version)" if existing else "create"
            log(f"{slug}: would {action} (checksum {checksum[:16]}…)")
            published_count += 1
            continue

        try:
            log(f"{slug}: publishing…")
            result = publish_schema(
                base_url, site_base_url, args.zenodo_token, schema_path, slug, existing
            )
            # Preserve a stable concept DOI across versions.
            if existing and not result.get("concept_doi"):
                result["concept_doi"] = existing.get("concept_doi")
                result["concept_recid"] = existing.get("concept_recid")
            result["checksum"] = checksum
            result["updated_at"] = now
            mapping[slug] = result
            published_count += 1
            log(
                f"{slug}: published concept DOI {result.get('concept_doi')} "
                f"(version {result.get('version_doi')})"
            )
        except Exception as err:  # noqa: BLE001 - keep going across schemas
            warn(f"{slug}: failed to publish: {err}")
            failures += 1

    if not args.dry_run:
        with open(args.mapping, "w", encoding="utf-8") as handle:
            json.dump(mapping, handle, indent=2, sort_keys=True)
            handle.write("\n")

    log(
        f"Done. published={published_count} skipped={skipped_count} failures={failures}"
    )
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
