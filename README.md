# DICOMpare

MRI protocol validation for global collaboration. Validate your DICOMs against community protocols and standards, or build and share your own schemas for multi-site studies.

**Your data never leaves your computer** — all processing happens locally in your browser or desktop app.

## Use Online

The easiest way to use DICOMpare is through the web app:

**[dicompare-web.vercel.app](https://dicompare-web.vercel.app)**

No installation required. Works in any modern browser.

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

## Development

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

## How It Works

1. **Load Data or Schema** — Upload your DICOM files or select from community protocols
2. **Compare & Validate** — Check compliance or edit schemas to match your study requirements
3. **Export & Share** — Download JSON schemas or PDF compliance reports

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
