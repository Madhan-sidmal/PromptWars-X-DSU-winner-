# 🛡️ SafeRoute AI — Predictive Risk Navigator

> **"It doesn't just tell you the safest route — it tells you *when* a route becomes unsafe."**

---

## 🎯 Challenge Vertical

**Urban Safety** — Route safety intelligence for urban commuters.

---

## 💡 Problem Statement

Urban commuters face unpredictable safety risks due to changing crowd levels, poor lighting, and isolated road segments. Existing navigation tools show directions, not danger.

**SafeRoute AI** adds a *time dimension* to route safety. It doesn't just score routes — it **predicts when they become unsafe**, giving commuters the intelligence to decide, not just the direction.

---

## 🚀 Core Features

| Feature | Description |
|---|---|
| 🗺️ **Real Google Maps** | Live map with actual routes via Directions API |
| 📍 **Auto Location Detection** | Geolocation API detects your position automatically |
| 🔍 **Places Autocomplete** | Type any destination with Google Places search |
| 🔮 **Future Risk Prediction** | Projects route safety 2 hours ahead in 15-min intervals |
| 🎯 **Confidence Score** | Measures reliability: `confidence = 1 − σ²(segmentRisks) × 4` |
| 🧭 **Decision Mode Toggle** | Switch between Fastest / Balanced / Safest |
| ⚠️ **Critical Segment Alerts** | Pinpoints risky road segments with reasons |
| ⏱️ **Departure Simulation** | Slider: "What if I leave later?" — recalculates all risks |

---

## 🧠 Approach & Logic

### Architecture

```
User Input (Origin + Destination)
        ↓
Google Directions API → Fetches 2-3 real alternative routes
        ↓
Risk Engine (our intelligence layer)
  ├── Analyses each route step by step
  ├── Scores: road type, lighting heuristics, crowd decay, isolation
  ├── Applies time-of-day multiplier (night = 1.8×, morning = 0.7×)
  ├── Computes confidence from segment variance
  └── Projects risk 2 hours into the future
        ↓
UI renders: route cards, risk timeline, critical alerts
        ↓
Google Maps renders: color-coded routes on live map
```

### Risk Formula (per route step)

```
stepRisk = (baseRisk × 0.30 + (1-lighting) × 0.25 + (1-crowd) × 0.20
          + isolation × 0.15 + distanceFactor × 0.10) × timeMultiplier
```

**Road type heuristics** (derived from Directions API step instructions):

| Road Type Keywords | Base Risk | Lighting | Isolation |
|---|---|---|---|
| Highway, NH, Expressway | 0.12 | 0.85 | 0.10 |
| Main Road, MG Road, Ring Road | 0.18 | 0.80 | 0.15 |
| Park, Garden, Lake | 0.50 | 0.35 | 0.70 |
| Cross, Lane, Layout | 0.40 | 0.45 | 0.55 |
| Underpass, Flyover | 0.45 | 0.40 | 0.60 |

**Time multipliers:**

| Period | Multiplier | Reason |
|---|---|---|
| 06:00–10:00 | 0.70 | Morning rush (more people = safer) |
| 10:00–18:00 | 0.85 | Daytime |
| 18:00–20:00 | 1.10 | Dusk |
| 20:00–22:00 | 1.40 | Evening |
| 22:00–05:00 | 1.80 | Late night (highest risk) |

### Decision Modes

- **Safest**: Minimises `riskScore`
- **Fastest**: Minimises `estimatedMinutes`
- **Balanced**: Minimises `0.6 × riskScore + 0.4 × (duration/60)`

### What makes this "Advanced"

> We take Google's routes → override with predictive safety logic.

Google gives directions. We give **safety intelligence on top**.

---

## 🔗 Google Services Integration

| Service | Purpose | How Used |
|---|---|---|
| **Maps JavaScript API** | Render interactive map | Base map, route polylines, markers |
| **Directions API** | Fetch real routes | Multiple alternatives with step-by-step data |
| **Geolocation API** | Detect user position | Auto-fill origin, center map |
| **Places API** | Autocomplete search | Destination input with suggestions |
| **Geocoding API** | Reverse geocode | Convert lat/lng to readable address |
| **Google Fonts** | Typography | Plus Jakarta Sans, Inter, JetBrains Mono |

---

## 🗺️ How the Solution Works

1. **Open the app** → Location auto-detected, map centers on you
2. **Type a destination** → Places Autocomplete suggests locations
3. **Click "Find Routes"** → Directions API fetches 2-3 real routes
4. **View Route Cards** → Each scored with risk level, confidence, duration
5. **Click a card** → Expands 2-hour risk forecast timeline
6. **Drag the slider** → "What if I leave 30 min later?" — all risks recalculate
7. **Switch modes** → Fastest/Balanced/Safest changes the recommendation

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, Vanilla CSS, Vanilla JavaScript (ES6+) |
| Maps | Google Maps JavaScript API |
| Routes | Google Directions API |
| Search | Google Places API (Autocomplete) |
| Location | Browser Geolocation API + Google Geocoding |
| Fonts | Google Fonts (Plus Jakarta Sans, Inter, JetBrains Mono) |
| Hosting | Static — no server required |

---

## 📐 Assumptions

1. Route safety is **estimated heuristically** from road type keywords in Directions API step instructions (no real crime/lighting data in prototype)
2. **Time-of-day** is the primary risk factor — late night routes are scored significantly riskier
3. **Crowd density decay** follows a simplified model (rush hours = safe, 2 AM = risky)
4. The system is designed for **Indian cities** (component restriction set to India, default center: Bangalore)
5. **3 alternative routes** are requested from Directions API for meaningful comparison

---

## 📁 Project Structure

```
PromptWars-X-DSU-winner-/
├── index.html      # App shell, Google Maps API loader, Places inputs
├── styles.css      # Light trustworthy theme, full mobile responsive
├── script.js       # Risk engine + Google Maps integration + UI
├── .gitignore      # Excludes reference folder
└── README.md       # This file
```

---

## 🏃 Running Locally

No build step. Open `index.html` in any modern browser:

```bash
start index.html
```

> **Note:** Google Maps API requires an internet connection. The API key has HTTP referrer restrictions for security.

---

## 🧪 Test Scenarios

| Scenario | Expected |
|---|---|
| Allow location → type "Bangalore Airport" → Find Routes | 2-3 routes shown, risk-scored, map rendered |
| Drag slider to +60 min | Risk levels shift, recommendation may change |
| Switch to Fastest mode | Shortest route recommended despite higher risk |
| Search at 2 PM vs 11 PM | Same routes, very different risk scores |
| Deny location → type both origin and destination | Works with manual input |

---

*Built for PromptWars Challenge — DSU Edition*
