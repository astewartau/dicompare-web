# dicompare Web & Desktop App

This repository contains the **web and desktop application** for [dicompare](https://github.com/astewartau/dicompare-pip), an open-source tool for automated validation and comparison of MRI acquisition protocols using DICOM metadata.

The app provides a visual interface for building, viewing, and validating imaging protocol schemas — all running locally in the browser with no data uploads required.

dicompare is a collaboration between the [Neurodesk](https://www.neurodesk.org/) and [Brainlife](https://brainlife.io/) groups.

**Live app:** [dicompare.neurodesk.org](https://dicompare.neurodesk.org/) | [brainlife.io/dicompare](https://brainlife.io/dicompare)

<img width="1386" height="844" alt="image" src="https://github.com/user-attachments/assets/1fc347ab-4daa-43a8-ab16-6a6013f33dd3" />

---

## How It Works

This app is a frontend built on top of the [`dicompare`](https://github.com/astewartau/dicompare-pip) Python package, which runs in the browser via [Pyodide](https://pyodide.org/) (Python compiled to WebAssembly). All DICOM processing happens locally — no imaging data leaves your machine.

For the command-line interface (CLI) or Python API, see the [`dicompare` pip package](https://github.com/astewartau/dicompare-pip).

---

## Features

- **Workspace** — Load DICOM files, build protocol schemas from reference data, attach schemas from the built-in library, and validate test data against schemas with visual compliance reports
- **Schema Viewer** — Browse, inspect, and print protocol schemas from the built-in library or loaded from file/URL
- **Image Viewer** — View DICOM and NIfTI volumes with multiplanar display and side-by-side comparison
- **Print Reports** — Generate formatted compliance and protocol reports with configurable sections and embedded volume thumbnails
- **Schema Library** — Bundled protocol templates from HCP, ABCD, UK Biobank, PING, and domain-specific guidelines (QSM, ASL, MS/CMSC)
- **Privacy-First** — All processing is local; no data is uploaded to any server

---

## Desktop App

For offline use or better performance, download the desktop app from [GitHub Releases](https://github.com/astewartau/dicompare-web/releases):

- **Windows**: `.exe` installer or portable version
- **macOS**: `.dmg` disk image
- **Linux**: `.AppImage` or `.deb` package

The desktop app includes full offline support (no internet required after installation), PDF export for compliance reports, and all Python dependencies bundled via Pyodide.

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

- [dicompare Python Package](https://github.com/astewartau/dicompare-pip) — Core engine, CLI, and Python API
- [Live App (Neurodesk)](https://dicompare.neurodesk.org/)
- [Live App (Brainlife)](https://brainlife.io/dicompare)
- [Report Issues](https://github.com/astewartau/dicompare-web/issues)
