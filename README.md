<div align="center">

<img src="docs/assets/logo.svg" alt="FretTune logo" width="96" height="96" />

# FretTune

### The precision tuner that opens in one tap, works offline and never shows you an ad.

Guitar · Bass · Ukulele — Needle & Strobe modes — 100% local audio processing

[![Live Demo](https://img.shields.io/badge/▶_Live_Demo-Try_it_now-10b981?style=for-the-badge)](https://miguelrm90.github.io/fret-tune/)

[![Deploy](https://github.com/MiguelRM90/fret-tune/actions/workflows/deploy.yml/badge.svg)](https://github.com/MiguelRM90/fret-tune/actions/workflows/deploy.yml)
[![PWA Ready](https://img.shields.io/badge/PWA-Ready-5a0fc8?logo=pwa&logoColor=white)](https://web.dev/progressive-web-apps/)
[![Offline First](https://img.shields.io/badge/Offline-First-0ea5e9)](#-how-it-works)
[![Web Audio API](https://img.shields.io/badge/Web_Audio-AudioWorklet-f97316)](https://developer.mozilla.org/docs/Web/API/AudioWorklet)
[![Angular 22](https://img.shields.io/badge/Angular-22-dd0031?logo=angular&logoColor=white)](https://angular.dev)
[![TypeScript strict](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript&logoColor=white)](tsconfig.json)
[![No Ads · No Tracking](https://img.shields.io/badge/No_Ads-No_Tracking-10b981)](#-privacy)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

<br />

<img src="docs/assets/hero-tuning-e2.png" alt="FretTune tuning the low E string in real time: the needle moves from flat to centered and turns green" width="320" />

</div>

---

## 🎸 Why FretTune?

Free tuner apps have become ad delivery platforms: full-screen interstitials between strings, "Pro" paywalls for basic features, unnecessary permissions and 40 MB downloads — just to hear if your E is flat.

**FretTune is the opposite:**

| | Typical "free" tuner app | **FretTune** |
|---|---|---|
| Ads | Banners + interstitials | **None. Ever.** |
| Install | App store, account, updates | **Open a URL** (install optional) |
| Works offline | Sometimes | **Always** (Service Worker) |
| Your audio | Unknown | **Never leaves your device** |
| Strobe mode | Paid tier | **Free** |
| Source code | Closed | **MIT, auditable** |

<div align="center">

<img src="docs/assets/strobe-lock.png" alt="Strobe display drifting and then locking when the string reaches the exact pitch" width="320" />

</div>

---

## ✨ Features

**Tuning**
- 🎯 **Needle gauge** — fluid analog meter (±50 cents) with reactive color feedback.
- ⚡ **Digital strobe** — multi-band phase-locked pattern that freezes when you are dead-on.
- 🎼 **Guided mode** — interactive string checklist with per-string lock and completion indicator (✓).
- 🌈 **Chromatic mode** — automatic detection across any musical note and octave.
- 🔊 **Reference tones** — play pure target pitches for any string directly from the UI.

**Instruments & tunings**
- **6-String Guitar**: Standard, Half step down, Drop D, Drop C, DADGAD, Open G, Open D, Open E.
- **4 & 5-String Bass**: Standard, Half step down, Drop D, 5-string standard (low B0 ~30.9 Hz).
- **Ukulele**: Standard (high G), Low G, D tuning, Baritone.
- **Custom Tunings**: Define and save your own custom string configurations (3 to 12 strings).

<div align="center">

<img src="docs/assets/tunings-showcase.png" alt="FretTune presets for Guitar Drop D, 5-String Bass low B0, and Ukulele Standard" width="840" />

</div>

**Pro calibration & ergonomics**
- 🎛️ Concert pitch **A4 calibration** from **430 Hz to 450 Hz** (default 440 Hz).
- 📏 Tolerance windows: **Strict (±2¢) · Normal (±5¢) · Relaxed (±10¢)**.
- 🌐 Note naming in **Anglo-Saxon letters (C · D · E)** or **Latin solfège (Do · Re · Mi)**.
- 📳 **Haptic feedback** upon hitting target pitch, **Screen Wake Lock**, and **Dark / Light themes**.

<div align="center">

<img src="docs/assets/mockup-mobile-desktop.png" alt="FretTune on a mobile phone and on a desktop browser side by side" width="840" />

</div>

---

## ▶️ Try it in one click

1. Open **[miguelrm90.github.io/fret-tune](https://miguelrm90.github.io/fret-tune/)** on your phone or laptop.
2. Allow microphone access.
3. Pluck a string.

> 💡 **Install it (optional):** use *Add to Home Screen* on iOS/Android or the install icon in Chrome/Edge's address bar. After the first visit it works **100% offline**.

<details>
<summary><b>📷 Scan QR to open on your phone</b></summary>
<br />
<div align="center">
  <img src="docs/assets/qr-demo.png" alt="QR code linking to the FretTune live demo" width="180" />
</div>
</details>

<details>
<summary><b>🎛️ Preview calibration & settings modal</b></summary>
<br />
<div align="center">
  <img src="docs/assets/settings-calibration.png" alt="FretTune settings modal showing A4 432 Hz calibration, Solfège notation and ±2 cents strict tolerance" width="300" />
</div>
</details>

---

## 🧠 How it works

```mermaid
flowchart LR
    MIC["🎤 Microphone<br/>getUserMedia"] --> WL["AudioWorklet<br/>capture.worklet"]
    WL -- "Zero-copy PCM frames" --> WK["Web Worker<br/>DSP engine"]
    subgraph WK_DSP["Off-main-thread DSP"]
        DEC["Decimator"] --> MPM["McLeod Pitch Method<br/>NSDF + parabolic interp."]
        MPM --> SM["Log-domain smoother"]
    end
    WK --> WK_DSP
    WK_DSP -- "pitch, clarity" --> SIG["Angular Signals<br/>OnPush · zoneless"]
    SIG --> UI["Needle / Strobe UI"]
    SW["Service Worker<br/>ngsw"] -. "offline cache" .-> UI
```

| Layer | Implementation |
|---|---|
| Capture | `AudioWorklet` (`capture.worklet.ts`) — low-latency PCM capture with recyclable `ArrayBuffer` pool. |
| Analysis | Dedicated **Web Worker** running a pure TypeScript **McLeod Pitch Method (NSDF)** with FFT acceleration and parabolic interpolation (YIN also available via detector registry). |
| Stabilization | Low-pass decimation for bass frequencies + log-domain exponential smoothing and median filtering. |
| UI | Angular 22 standalone components, **Signals**, `OnPush`, zoneless reactive change detection. |
| Design system | [`pwa-ui-core`](https://github.com/MiguelRM90/pwa-ui-core) — native CSS tokens and standalone components, zero Tailwind. |
| Offline | `@angular/service-worker` prefetching all app bundles, icons and worklets. |
| Security | CI verifies **CSP (`strict-dynamic` + SHA-256), SRI (`sha384`) and `ngsw.json` allowlist** on every build; GitHub Actions pinned by commit SHA. |

<details>
<summary><b>📂 Project structure</b></summary>

```text
src/app/
├── core/
│   ├── audio-engine/   # Mic input, audio lifecycle, reference tone generator, pitch service
│   ├── dsp/            # McLeod (MPM), YIN, FFT, decimator, pitch smoother (+ specs & bench)
│   ├── music/          # Instruments, tunings, custom tunings, note naming & reading resolver
│   ├── services/       # Signal stores (tuner, settings, checklist), haptics, wake-lock, SW updates
│   ├── workers/        # AudioWorklet capture + DSP Web Worker + typed message protocol
│   ├── models/ constants/ utils/
├── features/
│   ├── tuner/          # Needle gauge, strobe display, string selector, note display, mic prompt
│   └── settings/       # Calibration, notation, instrument & custom tuning modal
└── shared/             # Header, toggle-switch, note-name & cents pipes
```
</details>

---

## 🔒 Privacy

- Audio is processed **in memory, on your device**. Nothing is recorded, uploaded or stored.
- No analytics, no cookies, no third-party scripts.
- Strict Content Security Policy (`default-src 'self'`, `connect-src 'self'`, anti-framing guard) verified automatically in CI.

---

## 🛠️ Local development

**Prerequisites:** Node.js 24 · `pnpm` · the [`pwa-ui-core`](https://github.com/MiguelRM90/pwa-ui-core) repository cloned **next to** this one (`../pwa-ui-core`).

```bash
# 1. Clone both repositories side by side
git clone https://github.com/MiguelRM90/pwa-ui-core.git
git clone https://github.com/MiguelRM90/fret-tune.git
cd fret-tune

# 2. Install dependencies
pnpm install

# 3. Build the AudioWorklet and start the dev server
pnpm start
```

Navigate to `http://localhost:4200/` and allow microphone access.

| Script | Description |
|---|---|
| `pnpm start` | Bundle `capture.worklet.ts` and start the development server |
| `pnpm test` | Static security scan + zero-dependency unit test suite (`node --test`) |
| `pnpm bench` | Run the McLeod pitch detector performance benchmark |
| `pnpm build:gh-pages` | Production build with `--base-href /fret-tune/` + CSP/SRI/`ngsw.json` verification |

---

## 📄 License

[MIT](LICENSE) © [MiguelRM90](https://github.com/MiguelRM90)
