# 🛡️ SafeRoute AI — Predictive Risk Navigator

> **"It doesn't just tell you the safest route — it tells you *when* a route becomes unsafe."**

---

## 🎯 Challenge Vertical

**Urban Safety** — Route safety intelligence for night-time and late-evening urban commuters.

---

## 💡 Problem Statement

Urban commuters—especially those travelling late at night—face unpredictable safety risks due to changing crowd levels, poor lighting, and isolated road segments. Existing navigation tools show directions, not danger.

**SafeRoute AI** solves this by adding a *time dimension* to route safety. It doesn't just score routes; it **predicts when they become unsafe**, giving commuters the intelligence to decide—not just the direction.

---

## 🚀 Core Features

| Feature | Description |
|---|---|
| 🔮 **Future Risk Prediction** | Projects route safety 60 minutes ahead in 5-minute intervals |
| 🎯 **Confidence Score** | Measures reliability using segment-risk variance: `confidence = 1 − σ(segmentRisks)` |
| 🧭 **Decision Mode Toggle** | Switch between Fastest / Balanced / Safest — changes recommendation logic |
| ⚠️ **Critical Segment Alerts** | Pinpoints the *exact* dangerous road segment and explains why |
| ⏩ **"Leave Later" Simulation** | Recalculates all risks shifted +20 minutes — shows predictive impact |
| 🤖 **AI Explanation Engine** | Human-readable rationale for every recommendation with risk maths |

---

## 🧠 Approach & Logic

### Architecture (Pure Frontend, No Backend)

```
RouteDataStore  →  Simulated urban segments (lighting, crowd, isolation)
     ↓
RiskEngine      →  Composite risk score per segment per hour
     ↓
TimelineEngine  →  12-tick × 5-min forecast for 60-minute window
     ↓
ConfidenceEngine→  Segment variance → reliability score
     ↓
AnalysisEngine  →  Picks recommended route by decision mode
     ↓
UIController    →  Renders cards, timeline chart, alerts, explanation
```

### Risk Formula

Each road segment is scored using three factors:

```
segmentRisk = (1 − lighting)   × 0.35
            + (1 − crowd(t))   × 0.35
            + isolation        × 0.30
            + nightPenalty(t)
```

**Time-aware crowd decay:**

| Time Window | Crowd Multiplier |
|---|---|
| 07:00–10:00 | 100% (Morning rush) |
| 10:00–16:00 | 75% (Daytime) |
| 16:00–20:00 | 90% (Evening rush) |
| 20:00–22:00 | 50% (Early night) |
| 22:00–02:00 | 20% (Late night) |
| 02:00–07:00 | 10% (Dead of night) |

Night penalty (+0.20 after 21:00) models increased vulnerability.

### Decision Modes

- **Safest**: Minimises `riskScore`
- **Fastest**: Minimises `duration`
- **Balanced**: Minimises `0.6 × riskScore + 0.4 × (duration/25)`

### Confidence Score

```
confidence = 1 − (σ(segmentRisks) / 0.5)
```

A route with uniformly safe segments → high confidence.  
A route with mixed safe/risky segments → low confidence (deceptive average).

---

## 🗺️ How the Solution Works

1. **Select** origin, destination, departure time, and decision mode
2. **Click "Analyze Routes"** — the engine scores 3 simulated routes across 4 segments each
3. **View Route Cards** — risk level, confidence, duration, and future prediction tag
4. **Check Timeline** — hover each bar to see exact risk % at each 5-minute interval
5. **Read Critical Alerts** — pinpointed dangerous segments with explanations
6. **Click "Leave 20 mins later?"** — watch risk projections shift and recommendations potentially change
7. **Read the AI Explanation** — full rationale in plain English

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | HTML5, Vanilla CSS, Vanilla JavaScript (ES6+) |
| Fonts | Google Fonts (Inter + JetBrains Mono) |
| Data | Simulated urban segment data (rule-based engine) |
| Hosting | Static — no server required |

> **Google Services integration:** Google Fonts API is used for typography (Inter & JetBrains Mono). The architecture is designed to be extended with Google Maps Routes API and Google Places API for real segment data without changing the core risk engine.

---

## 📐 Assumptions

1. Urban road network is modelled as **discrete segments** with fixed physical properties (lighting, isolation level)
2. **Crowd density** follows a realistic daily pattern (rush hours + night decay) derived from general urban mobility research
3. **Three representative routes** are simulated (safe highway, mixed market, risky shortcut) — representative of real urban tradeoffs
4. Safety analysis is **time-sensitive** but not GPS-dependent for the prototype
5. A night-time penalty of +20% risk is applied uniformly after 21:00 to model reduced ambient safety

---

## 📁 Project Structure

```
PromptWars-X-DSU-winner-/
├── index.html      # App shell, semantic HTML5
├── styles.css      # Full design system (dark, glassmorphism, animations)
├── script.js       # Risk engine, timeline, confidence, UI controller
└── README.md       # This file
```

---

## 🏃 Running Locally

No build step needed. Simply open `index.html` in any modern browser:

```bash
# Option 1: Direct open
start index.html

# Option 2: Quick local server
npx serve .
```

---

## 🧪 Test Scenarios

| Scenario | Expected Behaviour |
|---|---|
| Depart at 22:30, Safest mode | Route B recommended; Route A flagged for Canal Road Underpass |
| Depart at 08:00, Fastest mode | Route C recommended (shortest); risk acceptable in morning |
| Click "Leave 20 mins later" | Risk levels increase; recommendation may change to Route B |
| Switch to Balanced mode | Recommendation blends risk and duration |
| Switch to Fastest mode | Route C (5.1 km) recommended despite risk |

---

*Built for PromptWars Challenge — DSU Edition*
