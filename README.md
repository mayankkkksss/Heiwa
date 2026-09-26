# HEIWA (平和) — A Quiet Life in Japan

HEIWA is a calm, contemplative Japanese neighborhood exploration web game built with **Three.js** and **Vite**.

Experience a peaceful morning in Sakuragaoka District: walk along quiet residential streets, visit HIKARI MART, sit under cherry blossoms in the park, pet Mochi the neighborhood cat, and greet local residents.

---

## 🌸 Features

- **Atmospheric 3D Neighborhood**: Detailed residential district with roads, sidewalks, apartments, houses, parks, vending machines, utility poles, and seasonal flora.
- **Dynamic Time & Lighting**: Soft morning to twilight transitions with warm sun rays and street lamp illumination.
- **Procedural Soundscape**: Web Audio-based wind, distant city ambience, birdsong, and footsteps.
- **Lived-In Neighborhood**: 10 unique residents with daily routines and schedules.
- **Exploration & Morning Errand Quest**: Interactive mailboxes, vending machines, park benches, bicycle, drinking fountain, convenience store shelves, and dialogue.

---

## 🚀 Getting Started

### Prerequisites

- [Node.js](https://nodejs.org/) (version 18+ recommended)
- Modern web browser with WebGL support

### 1. Install Dependencies

```bash
npm install
```

### 2. Run Local Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

### 3. Run Production Build

```bash
npm run build
```

This compiles the project into the optimized `dist/` directory.

### 4. Preview Production Build Locally

```bash
npm run preview
```

Open [http://localhost:4173](http://localhost:4173) to preview the exact production bundle.

### 5. Automated Tests & Audits

```bash
# Run language and architecture audit
npm test

# Run headless startup & system regression suite
node scripts/test_startup.js
```

---

## 🌐 Deploying to Vercel

HEIWA is configured for seamless static deployment on [Vercel](https://heiwa-henna.vercel.app/):

1. **Import Git Repository** on Vercel Dashboard.
2. **Framework Preset**: `Vite` (auto-detected).
3. **Build Command**: `npm run build`
4. **Output Directory**: `dist`
5. **Environment Variables**: None required.
6. Click **Deploy**.

The static production assets will be built and served via Vercel's global CDN.

---

## 🎮 Controls

| Action | Control |
|---|---|
| **Move** | `W`, `A`, `S`, `D` / Arrow Keys |
| **Look** | Mouse Orbit / Drag |
| **Jog** | `Shift` (Hold) |
| **Jump** | `Space` |
| **Interact / Advance Dialogue** | `E` |
| **Pause Menu / Exit Dialogue** | `Escape` |

---

**Whole project is AI-generated Including README.md; perception are not.**
