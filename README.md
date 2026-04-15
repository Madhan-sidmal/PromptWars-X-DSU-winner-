# SafeRoute AI - Predictive Risk Navigator

"It does not just tell you the safest route - it tells you when a route becomes unsafe."

## GitHub Description (Short)

Predictive navigation system that recommends the safest route and forecasts when routes become unsafe using real-time context. Includes live safety alerts, deviation detection, and a decision engine built on Google Maps.

## Problem

Urban navigation systems optimize for speed, ignoring safety dynamics such as low lighting, crime-prone zones, and declining activity at night. Users lack real-time, context-aware safety guidance during travel.

## Solution

SafeRoute AI is a lightweight decision engine that:

- Evaluates multiple routes using safety factors
- Predicts how risk evolves over time
- Recommends the safest and most stable route
- Actively monitors the user during the journey

## How It Works

- Fetches multiple routes using Google Maps Routes API
- Breaks routes into segments
- Assigns safety factors:
  - Crime risk (mock dataset)
  - Lighting conditions (simulated)
  - Crowd presence (time-based logic)
- Calculates:
  - Current safety score
  - Future risk score
  - Confidence level
- Recommends the safest route with explanation
- Activates Safety Mode for live monitoring

## Key Features

### 1. Predictive Risk Engine

- Detects when a route becomes unsafe over time
- Example: "Route A becomes risky in 12 minutes"

### 2. Intelligent Decision System

- Ranks routes based on safety
- Provides clear reasoning:
        - "Better lighting + higher activity"

### 3. Safety Mode (Active Protection)

- Critical segment alerts
- Route deviation detection
- One-tap emergency trigger (simulated)

### 4. Dynamic Simulation

- "Leave later" -> risk recalculates
- "Simulate incident" -> route adapts instantly

## Tech Stack

- Frontend: HTML, CSS, JavaScript
- Mapping: Google Maps JavaScript API
- Routing: Google Routes API
- Location: Geolocation API
- Data: Lightweight simulated datasets and heuristics
- Optional backend extension: Python (Flask)

## Why This Stands Out

- Focuses on one critical problem: safety
- Adds time-based prediction, not just static analysis
- Provides explainable decisions, not black-box outputs
- Demonstrates real-time adaptability
- Acts as a decision intelligence layer over Google Maps

## Assumptions

- Crime and lighting data are simulated
- Crowd density is approximated using time logic
- Designed as a functional prototype, not a full-scale system

## How to Run

Run a local HTTP server from the project folder:

```bash
python -m http.server 5500
```

Then open:

```text
http://127.0.0.1:5500/index.html
```

## Deploy to Google Cloud Run

### Prerequisites

- Google Cloud project with billing enabled
- Google Cloud CLI installed and authenticated
- Required APIs enabled:
  - Cloud Run Admin API
  - Cloud Build API
  - Artifact Registry API

### 1. Set variables

```bash
export PROJECT_ID="your-gcp-project-id"
export REGION="asia-south1"
export SERVICE_NAME="saferoute-ai"
export REPOSITORY="saferoute"
export IMAGE_URI="$REGION-docker.pkg.dev/$PROJECT_ID/$REPOSITORY/$SERVICE_NAME:latest"
export MAPS_API_KEY="your-google-maps-api-key"
```

### 2. Configure gcloud

```bash
gcloud config set project $PROJECT_ID
```

### 3. Create Artifact Registry repository (one-time)

```bash
gcloud artifacts repositories create $REPOSITORY \
  --repository-format=docker \
  --location=$REGION \
  --description="SafeRoute container images"
```

### 4. Build image with Cloud Build

```bash
gcloud builds submit --config cloudbuild.yaml --substitutions _IMAGE_URI=$IMAGE_URI
```

### 5. Deploy to Cloud Run

```bash
gcloud run deploy $SERVICE_NAME \
  --image $IMAGE_URI \
  --platform managed \
  --region $REGION \
  --set-env-vars MAPS_API_KEY=$MAPS_API_KEY \
  --allow-unauthenticated
```

### 6. Open service URL

After deployment, Cloud Run prints a URL. Open it in the browser.

Note:
- Cloud Run automatically injects PORT and the app listens on it via server.js.
- The app injects MAPS_API_KEY from Cloud Run environment at runtime; no key is hardcoded in HTML.
- If Google Maps API key has HTTP referrer restrictions, add your Cloud Run URL host to allowed referrers.
- Recommended allowed referrers examples:
  - https://SERVICE-NAME-xxxxx-REGION.a.run.app/*
  - https://*.run.app/*

## Evaluation Alignment

- Code Quality: Modular and minimal
- Efficiency: Fast response (<= 2s target)
- Security: No sensitive data exposed
- Usability: Clear, actionable UI
- Google Services: Meaningful integration with decision override

## Future Scope

- Real-time crime and crowd data integration
- Mobile deployment with live tracking
- Smart alerts using IoT and public infrastructure
- Community-driven safety feedback

## Final Positioning

SafeRoute AI is not a navigation system - it is a predictive safety intelligence layer that helps users make smarter, safer decisions in urban environments.
