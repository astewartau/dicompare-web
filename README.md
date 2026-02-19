# DICOMpare

**DICOMpare** is an open-source, vendor-independent tool for automated validation and comparison of MRI acquisition protocols using DICOM metadata.

It enables researchers to determine whether imaging protocols implemented at different sites are truly equivalent, similar, or meaningfully different — a task that is currently manual, error-prone, and often infeasible in large, multi-site studies.

**Live service:** https://astewartau.github.io/dicompare-web/

<img width="1386" height="844" alt="image" src="https://github.com/user-attachments/assets/1fc347ab-4daa-43a8-ab16-6a6013f33dd3" />

---

## Why DICOMpare?

Large-scale neuroimaging studies increasingly rely on data collected across multiple scanners, institutions, and countries. Ensuring that MRI acquisition protocols are harmonized across sites is essential for reproducibility, data comparability, statistical validity, and clinical or regulatory reliability.

In practice, protocol alignment is extremely difficult.

Sites typically exchange protocol information through PDF documentation or vendor-specific exam cards. However, hardware configurations differ across scanners, software versions vary between sites, vendors encode parameters differently, and some parameters cannot be implemented identically on all systems. As a result, protocols that appear similar on paper often diverge substantially in practice.

At present, there is no automated, vendor-neutral way to verify whether two implemented MRI protocols are actually equivalent.

---

## What DICOMpare Does

DICOMpare performs structured comparisons of DICOM files to evaluate whether imaging protocols match a target reference or schema.

It operates directly on DICOM metadata and provides automated, interpretable assessments of similarity and deviation between protocols.

Users can compare imaging data in three primary ways.

### 1. Reference-Based Comparison

A user provides a set of reference DICOM files representing the *intended* protocol. DICOMpare compares new DICOM files against this reference set and reports differences in acquisition parameters.

### 2. Template-Based Comparison

DICOMpare includes preconfigured protocol templates derived from major large-scale studies. Users can compare their local imaging sequences against these standardized templates.

Current templates include protocols modeled after:

- UK Biobank  
- Human Connectome Project (HCP)  
- ABCD Study  
- PING  

These templates provide practical targets for harmonized data collection and replication of established acquisition strategies.

### 3. Single-File or Schema-Based Validation

A single DICOM file or a predefined schema can serve as the protocol definition. DICOMpare evaluates whether a set of DICOM instances conforms to that specification.

---

## Key Features

### Vendor-Independent Protocol Validation

DICOMpare works directly with DICOM metadata and does not depend on scanner manufacturer formats or proprietary exam card systems.

### Browser-Based Operation

DICOMpare runs in the browser, enabling local analysis without uploading imaging data. This avoids data transfer and reduces privacy and regulatory concerns.

### Pre-Acquisition Validation

Protocols can be validated *before* large-scale data collection begins. Investigators can define the intended protocol, implement it at each site, and verify equivalence across scanners before participant scanning starts. This prevents costly scan time loss and downstream data incompatibility.

### Open Source and Extensible

DICOMpare is released as open-source software and designed to grow with community contributions. The protocol template library will expand as new major studies and standards emerge.

---

## Example Use Case

A research consortium spanning South Africa, Texas, and Australia plans a joint neuroimaging study.

Without DICOMpare, teams must manually exchange protocol PDFs, attempt to reproduce parameters across different scanners, and rely on expert judgment to assess whether protocols truly match. Even small, unnoticed differences can later compromise data pooling and analysis.

With DICOMpare, each site implements the planned sequence, exports a small sample of DICOM files, and runs a comparison against the shared reference or template. Within minutes, the team receives an objective assessment of protocol alignment and parameter discrepancies, allowing corrections before full data collection begins.

---

## Impact

DICOMpare supports multi-site academic neuroimaging studies, international data-sharing consortia, large population studies such as UK Biobank and ABCD, clinical trials requiring harmonized imaging, and industry or translational research.

By automating protocol validation, DICOMpare reduces human error, increases confidence in cross-site comparability, and strengthens the scientific validity of pooled imaging datasets.

---

## Desktop App

For offline use or better performance, download the desktop app:

### Download

Get the latest release for your platform from [GitHub Releases](https://github.com/astewartau/dicompare-web/releases):

- **Windows**: `.exe` installer or portable version
- **macOS**: `.dmg` disk image
- **Linux**: `.AppImage` or `.deb` package

### Features

The desktop app includes:
- Full offline support (no internet required after installation)
- PDF export for compliance reports
- All Python dependencies bundled (Pyodide)

--- 
## Contributing

### Prerequisites

- Node.js 18+
- npm

### Web Development

```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

### Electron Development

```bash
# Download Pyodide packages for offline use
npm run download:pyodide

# Start Electron in development mode
npm run dev:electron
```

### Building

```bash
# Build web app
npm run build

# Build desktop app (choose your platform)
npm run build:linux
npm run build:mac
npm run build:win
```

## Tech Stack

- React 19 + TypeScript
- Tailwind CSS
- Pyodide (Python in WebAssembly)
- Electron (desktop app)

## License

MIT License — see [LICENSE](LICENSE) for details.

## Links

- [GitHub Repository](https://github.com/astewartau/dicompare-web)
- [Report Issues](https://github.com/astewartau/dicompare-web/issues)
