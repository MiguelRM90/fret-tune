# 🎸 FretTune

> Precision chromatic tuner Progressive Web App (PWA) for **Guitar**, **Bass**, and **Ukulele**. Built with **Angular 22**, **pwa-ui-core**, and native Web Audio APIs. **100% offline & local processing**.

[![License: MIT](https://img.shields.io/badge/License-MIT-emerald.svg)](LICENSE)
[![Angular 22](https://img.shields.io/badge/Angular-22-red.svg)](https://angular.dev)
[![PWA](https://img.shields.io/badge/PWA-Offline--First-blue.svg)](https://web.dev/progressive-web-apps/)

---

## ✨ Features

- **🎯 Dual Visualizer Modes**:
  - **Needle Gauge**: Fluid, spring-animated analog meter (±50 cents) with reactive color glow.
  - **Digital Strobe**: Precision multi-band phase-locked strobe pattern that halts completely when in tune.
- **🎸 Multi-Instrument Presets**:
  - **6-String Guitar**: Standard, Half step down, Drop D, Drop C, DADGAD, Open G, Open D, Open E.
  - **4 & 5-String Bass**: Standard 4-string, Half step down, Drop D, 5-string Standard (low B ~31 Hz).
  - **Ukulele**: Standard (high G), Low G, D tuning, Baritone.
- **⚡ Dual Tuning Modes**:
  - **Guided Mode**: Interactive string headstock with per-string completion checklist (✓) and string lock.
  - **Chromatic Mode**: Automatic detection across any musical note with octave.
- **🔊 Acoustic Reference Tones**: Play pure reference pitches for any string directly from the UI.
- **🎛️ Pro Calibration & Tolerances**:
  - Concert pitch A4 calibration from 430 Hz to 450 Hz (default 440 Hz).
  - Strict (±2¢), Standard (±5¢), and Relaxed (±10¢) tolerance windows.
- **🌐 International Note Naming**: Switch between **Anglo-Saxon letters** (C, D, E) and **Latin solfège** (Do, Re, Mi).
- **📳 Mobile Ergonomics**:
  - **Haptic Feedback**: Device vibration confirmation upon hitting target pitch.
  - **Screen Wake Lock**: Prevents screen dimming during tuning sessions.
  - **Theme Switcher**: Dark-first palette with seamless light mode support.
- **🔒 Zero Latency & Private**: Pitch detection runs locally on a background Web Worker via the McLeod Pitch Method (NSDF). No audio data leaves your device.

---

## 🛠️ Tech Stack

- **Framework**: Angular 22 (`@angular/build:application`, zoneless reactive change detection).
- **Design System**: [`pwa-ui-core`](https://github.com/MiguelRM90/pwa-ui-core) native CSS tokens & standalone components (Zero Tailwind).
- **Audio Engine**: Pure TypeScript implementation of the McLeod Pitch Method (NSDF) with parabolic interpolation and log-domain exponential smoothing.
- **Worker Concurrency**: Dedicated Web Worker for off-main-thread audio frame analysis at 60 FPS.
- **Package Manager**: `pnpm`.

---

## 🚀 Getting Started

### Prerequisites

- Node.js 22+ (or Node.js 24)
- `pnpm` 11+
- The `pwa-ui-core` repository located next to this project (`../pwa-ui-core`).

### Installation

```bash
pnpm install
```

### Development Server

```bash
pnpm start
```

Navigate to `http://localhost:4200/`. Allow microphone access when prompted.

### Run Unit Tests

Execute the zero-dependency test runner validating mathematical frequency conversions, pitch detection, noise gating, and smoothing:

```bash
pnpm test
```

### Production Build

```bash
pnpm build
```

The production output is generated in `dist/fret-tune/browser`.

### GitHub Pages Build

```bash
pnpm build:gh-pages
```

---

## 📦 Deployment (GitHub Pages)

A GitHub Actions workflow is provided at [`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). When committed to the `main` branch, the workflow:
1. Clones `pwa-ui-core`.
2. Installs dependencies with `pnpm`.
3. Runs the test suite.
4. Builds the PWA with `--base-href /fret-tune/`.
5. Publishes the site to GitHub Pages.

---

## 📄 License

MIT © [MiguelRM90](https://github.com/MiguelRM90)

