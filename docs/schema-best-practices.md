# Schema authoring best practices

Guidance for authoring validation schemas for the [dicompare schema library](https://dicompare.neurodesk.org). Schemas are typically built in the dicompare web interface and submitted via GitHub issue; this document describes what makes a schema accurate, portable, and maintainable. Reviewers use it as a checklist when approving submissions.

## 1. Decide what kind of schema you are writing

Most schemas are one of two kinds, and the right constraint style differs between them:

- **Reference protocol** — describes one specific, known acquisition setup (a study protocol, a scanner-specific sequence). Exact values are appropriate, including hardware fields like `Manufacturer`, `ManufacturerModelName`, and `ProtocolName`. Examples: *UK Biobank*, *HCP Young Adult*, *Axon diameter mapping*.
- **Guideline / compatibility schema** — checks whether arbitrary data meets the requirements of an analysis method or published guideline. Use ranges, tolerances, and rules; avoid constraining hardware- or site-specific fields at all. Examples: *ASL Clinical Guidelines*, *QSM Consensus Guidelines*, *Protocols for DWI analysis*.

Don't mix altitudes within one schema: if four acquisitions express generic requirements and a fifth pins exact values from one scanner, users can't tell which failures matter. If both views are valuable, publish two schemas and cross-reference them in the descriptions rather than duplicating acquisitions between files.

## 2. Choose the right constraint for each field

Supported constraints: exact `value`, `min`/`max` range, `value` + `tolerance`, `contains`, `contains_any`, `contains_all`.

- **Continuous numeric fields** (`RepetitionTime`, `EchoTime`, `SliceThickness`, `PixelSpacing`, `FlipAngle`, …): use a range or a tolerance unless you are pinning a reference protocol. Real scans vary slightly; exact matches are brittle. The editor's lint flags this (`exact-float`).
- **Enumerated fields** (`MRAcquisitionType`, `InPlanePhaseEncodingDirection`, `PatientPosition`, …): use the DICOM-defined values. `InPlanePhaseEncodingDirection` is `ROW` or `COL` — console display strings like `A >> P` never match stored DICOM and the lint flags them (`display-string`, `enum-mismatch`).
- **Composite/text fields** (`ImageType`, `ScanningSequence`, `SeriesDescription`): prefer `contains` / `contains_any` over exact matches. Be wary of constraining `SeriesDescription` at all in guideline schemas — naming is site-specific (`DIFF`, `dwi`, `ep2d_diff` all exist in the wild); if you must, use `contains_any` with the common variants.
- **Asserting absence**: an empty-string `value` (e.g. `ContrastBolusAgent: ""`) asserts the field is empty, e.g. pre-contrast.
- **Hardware/site fields** (`Manufacturer`, `SoftwareVersions`, `InstitutionName`, `ProtocolName`): constrain only in reference protocols, and only when the schema is genuinely scanner-locked. Exact `SoftwareVersions` breaks on every upgrade — include it only when the version materially matters. If the description says the schema applies to multiple platforms, the fields must not hard-require one of them.

## 3. Field constraints vs. rules — don't encode the same requirement twice

Field constraints are checked verbatim against every matching acquisition. If a requirement is conditional or cross-field ("the b>1500 shell needs ≥28 directions"), express it as a **rule**, and don't also pin the underlying derived fields (`DiffusionBValues`, `DirectionsPerShell`, …) to one example protocol with exact values — otherwise conforming data passes your rules but fails your fields.

For rules:

- Declare **every** field the implementation reads in the rule's `fields` list — an undeclared field is a runtime error, not a validation failure.
- Attach the rule to the acquisition that actually contains the data it checks. A rule requiring a low-b shell must not live on an acquisition whose b-values are all high.
- Distinguish severity: recommendation-level findings should be tagged `[warning]`; untagged messages read as hard failures.
- Boundary conditions: check comparisons at the recommended value itself (`< 5` vs `<= 5` — "at least 5" must pass at 5).

## 4. Test your schema against its own example

Every rule should have at least **one passing and one failing test case**, with meaningful names and descriptions. The single most valuable passing case is the schema's own recommended protocol: if the values you list in `fields` don't pass your own rules, one of the two is wrong. (This has caught real submissions.)

## 5. Identifiers and structure

- Rule ids and test-case ids must be **unique across the whole schema** — copying an acquisition and editing it silently duplicates ids.
- Every acquisition should have a short `description` (one line, shown in lists) and a `detailed_description` (markdown: purpose, key requirements, references). Don't leave placeholders like "Protocol from ProtocolFile.txt" or empty detailed descriptions.
- Add `tags` to every acquisition (e.g. `analysis:diffusion`, `brain`, method name) — they drive filtering in the library.
- `"tag": "derived"` marks non-DICOM fields computed by dicompare (e.g. `NumberOfDiffusionShells`, `PostLabelDelay`); use real DICOM tags for everything else.

## 6. Metadata and prose

- `name`, `version`, and `authors` are required. Bump `version` on any change to constraints or rules; prose-only fixes can share a version but note the change in the submission.
- The top-level `description` should state the schema's **intended use** (reference protocol vs. compatibility check), hardware assumptions, links to analysis code, and citations — the existing library schemas (ASL, HCP, MS CMSC) are good models.
- Proofread. Descriptions render verbatim in the app and in print reports.

## 7. Submission checklist

Before submitting (and for reviewers before approving):

- [ ] Schema kind is clear, and constraint altitude is consistent with it (§1)
- [ ] No exact matches on continuous fields in guideline schemas; no console display strings (§2)
- [ ] Editor lint warnings resolved or consciously accepted
- [ ] Rules declare all fields they read; severity tagged; attached to the right acquisition (§3)
- [ ] Each rule has ≥1 passing and ≥1 failing test case; the schema's own example values pass its own rules (§4)
- [ ] Rule/test ids unique; no placeholder or empty descriptions; tags present (§5)
- [ ] Metadata complete; prose proofread; hardware claims in the description match the field constraints (§6)
