/**
 * SafeRoute AI – Predictive Risk Navigator
 * Core Logic: Rule-based safety simulation engine
 *
 * Architecture:
 *  1. RouteDataStore    – Simulated urban route data
 *  2. RiskEngine        – Computes risk score from time + segment factors
 *  3. TimelineEngine    – Projects risk 60 mins into the future (12 ticks × 5 min)
 *  4. ConfidenceEngine  – Computes route reliability from segment variance
 *  5. UIController      – Orchestrates DOM updates
 */

'use strict';

/* ============================================================
   1. ROUTE DATA STORE (Simulated urban network data)
   ============================================================ */

const ROUTES = [
  {
    id: 'A',
    name: 'Route A',
    icon: '🅰️',
    via: 'Old City Market → Canal Road',
    duration: { fastest: 14, balanced: 17, safest: 20 }, // minutes
    distance: 6.2,   // km
    segments: [
      { name: 'Old City Market Square', lighting: 0.3, crowdBase: 0.8, isolation: 0.7 },
      { name: 'Canal Road Underpass',   lighting: 0.2, crowdBase: 0.5, isolation: 0.9 },
      { name: 'West Bridge Junction',   lighting: 0.7, crowdBase: 0.7, isolation: 0.3 },
      { name: 'Park Lane Stretch',      lighting: 0.4, crowdBase: 0.4, isolation: 0.6 },
    ],
    baseRisk: 0.55,
    criticalSegment: { name: 'Canal Road Underpass', reason: 'Low lighting + high isolation', riskLevel: 'critical' },
  },
  {
    id: 'B',
    name: 'Route B',
    icon: '🅱️',
    via: 'Tech Corridor → Highway Link',
    duration: { fastest: 18, balanced: 20, safest: 22 },
    distance: 7.8,
    segments: [
      { name: 'Tech Corridor Main',   lighting: 0.9, crowdBase: 0.8, isolation: 0.1 },
      { name: 'Highway Link Entry',   lighting: 0.85, crowdBase: 0.6, isolation: 0.2 },
      { name: 'New Bridge Overpass',  lighting: 0.8, crowdBase: 0.7, isolation: 0.2 },
      { name: 'Station Approach',     lighting: 0.75, crowdBase: 0.9, isolation: 0.1 },
    ],
    baseRisk: 0.18,
    criticalSegment: null,
  },
  {
    id: 'C',
    name: 'Route C',
    icon: '🅾️',
    via: 'Suburb Shortcut → Residential Zone',
    duration: { fastest: 12, balanced: 15, safest: 16 },
    distance: 5.1,
    segments: [
      { name: 'North Suburb Entry',      lighting: 0.6, crowdBase: 0.5, isolation: 0.5 },
      { name: 'Residential Zone Block',  lighting: 0.5, crowdBase: 0.3, isolation: 0.7 },
      { name: 'Market Back Lane',        lighting: 0.35, crowdBase: 0.2, isolation: 0.8 },
      { name: 'Industrial Exit Road',    lighting: 0.3, crowdBase: 0.15, isolation: 0.85 },
    ],
    baseRisk: 0.68,
    criticalSegment: { name: 'Industrial Exit Road', reason: 'Very low lighting + near-zero crowd density', riskLevel: 'critical' },
  },
];

/* ============================================================
   2. RISK ENGINE
   Computes a composite risk score (0–1) for a route at a given time.

   Formula:
     segmentRisk = (1 - lighting) * 0.35
                 + (1 - crowd(t)) * 0.35
                 + isolation * 0.30

   Time decay factors:
     crowd(t) = crowdBase * crowdDecay(hour)
     nightPenalty: applied linearly after 20:00

   Final route risk = mean(segmentRisks)
   ============================================================ */

const RiskEngine = (() => {
  /**
   * Returns a crowd multiplier [0,1] based on hour of day.
   * Models real-world crowd patterns: morning & evening peaks, quiet nights.
   */
  function crowdMultiplier(hour) {
    const h = hour % 24;
    if (h >= 7  && h < 10)  return 1.00; // morning rush
    if (h >= 10 && h < 16)  return 0.75; // daytime
    if (h >= 16 && h < 20)  return 0.90; // evening rush
    if (h >= 20 && h < 22)  return 0.50; // early night
    if (h >= 22 || h < 2)   return 0.20; // late night
    return 0.10;                          // dead of night
  }

  /**
   * Returns a night-time risk penalty [0, 0.25] added after 21:00.
   */
  function nightPenalty(hour) {
    const h = hour % 24;
    if (h >= 21 || h < 4) return 0.20;
    if (h >= 19)           return 0.10;
    return 0;
  }

  /**
   * Compute segment risk at a specific hour.
   */
  function segmentRisk(seg, hour) {
    const crowd = seg.crowdBase * crowdMultiplier(hour);
    const raw = (1 - seg.lighting) * 0.35
              + (1 - crowd)        * 0.35
              + seg.isolation      * 0.30;
    return Math.min(1, raw + nightPenalty(hour));
  }

  /**
   * Compute full route risk score at a given hour (returns 0–1).
   */
  function routeRisk(route, hour) {
    const scores = route.segments.map(s => segmentRisk(s, hour));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    return Math.min(1, mean);
  }

  /**
   * Classify a numeric risk score into a string level.
   */
  function classifyRisk(score) {
    if (score <= 0.35) return 'low';
    if (score <= 0.60) return 'medium';
    return 'high';
  }

  return { routeRisk, classifyRisk, segmentRisk };
})();

/* ============================================================
   3. TIMELINE ENGINE
   Generates a 12-tick (5-min interval) risk forecast for each route.
   ============================================================ */

const TimelineEngine = (() => {
  const TICKS = 12;
  const INTERVAL_MINS = 5;

  /**
   * Given a departure hour+minute, compute risk for each 5-min tick.
   * @returns Array<{ minuteOffset, hour, riskScore, level }>
   */
  function forecast(route, startHour, startMin) {
    const ticks = [];
    for (let i = 0; i < TICKS; i++) {
      const totalMins = startHour * 60 + startMin + i * INTERVAL_MINS;
      const hour = Math.floor(totalMins / 60);
      const min  = totalMins % 60;
      const score = RiskEngine.routeRisk(route, hour + min / 60);
      ticks.push({
        minuteOffset: i * INTERVAL_MINS,
        hour,
        min,
        riskScore: score,
        level: RiskEngine.classifyRisk(score),
      });
    }
    return ticks;
  }

  /**
   * Find the first tick where risk transitions to a worse level.
   * @returns {minuteOffset, time} or null
   */
  function findRiskTransition(ticks, currentLevel) {
    const levels = { low: 0, medium: 1, high: 2 };
    for (const t of ticks.slice(1)) {
      if (levels[t.level] > levels[currentLevel]) {
        return { minuteOffset: t.minuteOffset, time: `${String(t.hour).padStart(2,'0')}:${String(t.min).padStart(2,'0')}` };
      }
    }
    return null;
  }

  return { forecast, findRiskTransition, TICKS, INTERVAL_MINS };
})();

/* ============================================================
   4. CONFIDENCE ENGINE
   Computes route reliability based on segment risk variance.
   High variance = mixed safe+risky segments = low confidence.
   confidence = 1 - normalised_std_deviation
   ============================================================ */

const ConfidenceEngine = (() => {
  function compute(route, hour) {
    const scores = route.segments.map(s => RiskEngine.segmentRisk(s, hour));
    const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
    const variance = scores.reduce((sum, s) => sum + (s - mean) ** 2, 0) / scores.length;
    const stdDev = Math.sqrt(variance);
    // Normalise: max possible std dev ≈ 0.5
    const confidence = Math.max(0.35, 1 - (stdDev / 0.5));
    return Math.min(0.98, confidence);
  }
  return { compute };
})();

/* ============================================================
   5. ANALYSIS ENGINE
   Determines recommended route based on decision mode.
   ============================================================ */

const AnalysisEngine = (() => {
  function analyse(departureHour, departureMin, mode) {
    const h = departureHour + departureMin / 60;

    const results = ROUTES.map(route => {
      const riskScore = RiskEngine.routeRisk(route, h);
      const confidence = ConfidenceEngine.compute(route, h);
      const ticks = TimelineEngine.forecast(route, departureHour, departureMin);
      const transition = TimelineEngine.findRiskTransition(ticks, RiskEngine.classifyRisk(riskScore));

      return {
        route,
        riskScore,
        riskLevel: RiskEngine.classifyRisk(riskScore),
        confidence,
        duration: route.duration[mode],
        ticks,
        transition,
      };
    });

    // Pick recommended based on mode
    let recommended;
    if (mode === 'safest') {
      recommended = results.reduce((best, r) => r.riskScore < best.riskScore ? r : best);
    } else if (mode === 'fastest') {
      recommended = results.reduce((best, r) => r.duration < best.duration ? r : best);
    } else {
      // balanced: minimize risk + duration composite
      recommended = results.reduce((best, r) => {
        const score = r.riskScore * 0.6 + (r.duration / 25) * 0.4;
        const bestScore = best.riskScore * 0.6 + (best.duration / 25) * 0.4;
        return score < bestScore ? r : best;
      });
    }

    results.forEach(r => { r.isRecommended = r.route.id === recommended.route.id; });
    return { results, recommended };
  }

  return { analyse };
})();

/* ============================================================
   6. UI CONTROLLER
   ============================================================ */

const UI = (() => {
  // Cached DOM references
  const els = {
    origin:        () => document.getElementById('origin'),
    destination:   () => document.getElementById('destination'),
    departureTime: () => document.getElementById('departure-time'),
    analyzeBtn:    () => document.getElementById('analyze-btn'),
    simulateBtn:   () => document.getElementById('simulate-later-btn'),
    loadingState:  () => document.getElementById('loading-state'),
    resultsSection:() => document.getElementById('results-section'),
    simBanner:     () => document.getElementById('sim-banner'),
    simBannerText: () => document.getElementById('sim-banner-text'),
    analysisTimeDisplay: () => document.getElementById('analysis-time-display'),
    modeDisplay:   () => document.getElementById('mode-display'),
    recommendedTag:() => document.getElementById('recommended-tag-display'),
    routesGrid:    () => document.getElementById('routes-grid'),
    timelineChart: () => document.getElementById('timeline-chart'),
    segmentsList:  () => document.getElementById('segments-list'),
    explanationBox:() => document.getElementById('explanation-box'),
    modeButtons:   () => document.querySelectorAll('.mode-btn'),
  };

  let currentMode = 'safest';
  let isSimulated = false;

  /** Format hour:min as "HH:MM" */
  function fmt(h, m) {
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  /** Parse "HH:MM" time string to {h, m} */
  function parseTime(str) {
    const [h, m] = str.split(':').map(Number);
    return { h: isNaN(h) ? 22 : h, m: isNaN(m) ? 30 : m };
  }

  /** Convert risk score (0–1) to a percent string */
  function pct(v) { return `${Math.round(v * 100)}%`; }

  /** Returns risk bar fill class */
  function riskFillClass(level) {
    if (level === 'low') return 'low';
    if (level === 'medium') return 'medium';
    return 'high';
  }

  /** Returns risk display emoji */
  function riskEmoji(level) {
    if (level === 'low')    return '🟢';
    if (level === 'medium') return '🟡';
    return '🔴';
  }

  /** Returns risk display text */
  function riskText(level, score) {
    if (level === 'low')    return `Low Risk (${pct(score)})`;
    if (level === 'medium') return `Medium Risk (${pct(score)})`;
    return `High Risk (${pct(score)})`;
  }

  /** Builds the route card HTML */
  function buildRouteCard(result) {
    const { route, riskScore, riskLevel, confidence, duration, transition, isRecommended } = result;
    const fillClass = riskFillClass(riskLevel);
    const predictionHTML = buildPredictionTag(riskLevel, transition);

    return `
      <article class="route-card ${isRecommended ? 'recommended' : ''} ${riskLevel === 'high' ? 'high-risk' : ''}" role="listitem" aria-label="${route.name}">
        <div class="route-name">
          <span aria-hidden="true">${route.icon}</span>
          ${route.name}
        </div>
        <div class="route-desc">via ${route.via}</div>

        <div class="risk-bar-wrap">
          <div class="risk-bar-label">Risk Level</div>
          <div class="risk-bar-track">
            <div class="risk-bar-fill ${fillClass}" style="width:${pct(riskScore)}" role="progressbar" aria-valuenow="${Math.round(riskScore*100)}" aria-valuemin="0" aria-valuemax="100" aria-label="Risk level"></div>
          </div>
        </div>

        <div class="route-stats">
          <div class="stat-row">
            <span class="stat-label">${riskEmoji(riskLevel)} Safety</span>
            <span class="stat-value ${fillClass === 'low' ? 'green' : fillClass === 'medium' ? 'yellow' : 'red'}">${riskText(riskLevel, riskScore)}</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">⏱️ Duration</span>
            <span class="stat-value blue">${duration} min</span>
          </div>
          <div class="stat-row">
            <span class="stat-label">📏 Distance</span>
            <span class="stat-value">${route.distance} km</span>
          </div>
        </div>

        <div class="confidence-wrap">
          <div class="confidence-label">
            <span>🎯 Confidence</span>
            <span>${Math.round(confidence * 100)}% reliable</span>
          </div>
          <div class="confidence-bar-track">
            <div class="confidence-bar-fill" style="width:${pct(confidence)}"></div>
          </div>
        </div>

        ${predictionHTML}
      </article>
    `;
  }

  /** Builds the "when does this route become unsafe" prediction tag */
  function buildPredictionTag(currentLevel, transition) {
    if (!transition) {
      if (currentLevel === 'low') {
        return `<div class="prediction-tag safe">✅ Remains safe for the next 60 mins</div>`;
      }
      return `<div class="prediction-tag ${currentLevel === 'medium' ? 'warning' : 'danger'}">⚠️ Risk stays ${currentLevel} for the next 60 mins</div>`;
    }
    const icons = { medium: '⚠️', high: '🚨' };
    const classes = { medium: 'warning', high: 'danger' };
    return `
      <div class="prediction-tag ${classes[transition.level] || 'warning'}">
        ${icons[transition.level] || '⚠️'} Becomes ${transition.level} risk at <strong>${transition.time}</strong> (+${transition.minuteOffset} min)
      </div>
    `;
  }

  /** Builds the timeline chart rows */
  function buildTimeline(results, departureHour, departureMin) {
    const chartEl = els.timelineChart();
    chartEl.innerHTML = '';

    // Time labels row
    const times = [];
    for (let i = 0; i < TimelineEngine.TICKS; i++) {
      const totalMins = departureHour * 60 + departureMin + i * TimelineEngine.INTERVAL_MINS;
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      times.push(fmt(h, m));
    }

    results.forEach(result => {
      const row = document.createElement('div');
      row.className = 'timeline-row';
      row.setAttribute('role', 'row');

      const label = document.createElement('div');
      label.className = 'timeline-route-label';
      label.textContent = `Route ${result.route.id}`;

      const barsWrap = document.createElement('div');
      barsWrap.className = 'timeline-bars';

      result.ticks.forEach((tick, i) => {
        const bar = document.createElement('div');
        bar.className = `timeline-tick tick-${tick.level}`;
        bar.setAttribute('data-tooltip', `${times[i]}: ${Math.round(tick.riskScore * 100)}% risk`);
        bar.setAttribute('aria-label', `${times[i]}: ${tick.level} risk`);
        barsWrap.appendChild(bar);
      });

      row.appendChild(label);
      row.appendChild(barsWrap);
      chartEl.appendChild(row);
    });

    // Time labels
    const timesRow = document.createElement('div');
    timesRow.className = 'timeline-times';
    // Show only every 3rd label to avoid crowding
    times.forEach((t, i) => {
      const lbl = document.createElement('div');
      lbl.className = 'timeline-time-label';
      lbl.textContent = i % 3 === 0 ? t : '';
      timesRow.appendChild(lbl);
    });
    chartEl.appendChild(timesRow);
  }

  /** Builds the critical segment alerts */
  function buildSegments(results) {
    const list = els.segmentsList();
    list.innerHTML = '';

    // Collect all critical segments
    const alerts = [];

    results.forEach(result => {
      const { route, riskLevel } = result;

      if (route.criticalSegment) {
        alerts.push({
          severity: route.criticalSegment.riskLevel,
          icon: '🚨',
          title: `High Risk: ${route.criticalSegment.name}`,
          detail: route.criticalSegment.reason,
          routeTag: `Route ${route.id}`,
        });
      } else if (riskLevel === 'low') {
        alerts.push({
          severity: 'safe',
          icon: '✅',
          title: `All Clear on Route ${route.id}`,
          detail: 'No critical segments detected. Well-lit and populated throughout.',
          routeTag: `Route ${route.id}`,
        });
      }
    });

    // Sort: critical first
    alerts.sort((a, b) => {
      const order = { critical: 0, warning: 1, safe: 2 };
      return (order[a.severity] ?? 1) - (order[b.severity] ?? 1);
    });

    alerts.forEach(a => {
      const el = document.createElement('div');
      el.className = `segment-alert ${a.severity === 'critical' ? 'critical' : a.severity === 'safe' ? 'safe' : 'warning'}`;
      el.setAttribute('role', 'listitem');
      el.innerHTML = `
        <span class="segment-icon" aria-hidden="true">${a.icon}</span>
        <div class="segment-body">
          <div class="segment-title ${a.severity === 'critical' ? 'critical' : a.severity === 'safe' ? 'safe' : 'warning'}">${a.title}</div>
          <div class="segment-detail">${a.detail}</div>
        </div>
        <span class="segment-route-tag">${a.routeTag}</span>
      `;
      list.appendChild(el);
    });
  }

  /** Builds the AI explanation */
  function buildExplanation(results, recommended, departureHour, departureMin, mode, simulated) {
    const box = els.explanationBox();
    const depTime = fmt(departureHour, departureMin);
    const rec = recommended;
    const riskStr = `<span class="highlight-${rec.riskLevel === 'low' ? 'green' : rec.riskLevel === 'medium' ? 'yellow' : 'red'}">${rec.riskLevel} risk (${Math.round(rec.riskScore * 100)}%)</span>`;
    const confStr = `<span class="mono">${Math.round(rec.confidence * 100)}%</span>`;

    let futureStr = '';
    if (rec.transition) {
      futureStr = `However, <strong>at ${rec.transition.time}</strong> (+${rec.transition.minuteOffset} min), the risk is projected to escalate to <span class="highlight-red">${rec.transition.level}</span> as crowd density decreases and night-time factors intensify.`;
    } else if (rec.riskLevel === 'low') {
      futureStr = `The risk profile remains <span class="highlight-green">stable</span> across the entire 60-minute forecast window — an unusually safe corridor.`;
    } else {
      futureStr = `The elevated risk on this route is expected to <strong>persist</strong> for the next 60 minutes given current conditions.`;
    }

    const simNote = simulated ? '<p><strong>⏩ Simulation active:</strong> Analysis has been re-run with departure shifted +20 minutes. Notice how risk factors evolve with the later timeline.</p>' : '';

    box.innerHTML = `
      ${simNote}
      <p>
        Departing at <strong>${depTime}</strong> in <strong>${mode}</strong> mode, the system analysed 3 routes
        across ${ROUTES[0].segments.length} micro-segments each using lighting coverage, crowd density models,
        and isolation scoring.
      </p>
      <p>
        <strong>${rec.route.name}</strong> is recommended as the optimal choice, presenting ${riskStr}
        with a confidence rating of ${confStr}.
        ${rec.route.id === 'B' ? 'Its segments are consistently well-lit and populated, yielding low variance across all safety dimensions.' : 'Despite some segment variability, this route offers the best trade-off for the selected mode.'}
      </p>
      <p>${futureStr}</p>
      <p>
        Confidence score logic: routes with mixed safe/risky segments produce higher variance → lower confidence.
        <span class="mono">confidence = 1 − σ(segmentRisks)</span>. A score above 80% indicates consistent conditions throughout the route.
      </p>
    `;
  }

  /** Main render: given analysis results, update all UI sections */
  function render(analysis, departureHour, departureMin, simulated) {
    const { results, recommended } = analysis;

    // Summary bar
    els.analysisTimeDisplay().textContent = fmt(departureHour, departureMin);
    els.modeDisplay().textContent = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
    els.recommendedTag().textContent = `Route ${recommended.route.id}`;

    // Route cards
    els.routesGrid().innerHTML = results.map(r => buildRouteCard(r)).join('');

    // Timeline
    buildTimeline(results, departureHour, departureMin);

    // Segments
    buildSegments(results);

    // Explanation
    buildExplanation(results, recommended, departureHour, departureMin, currentMode, simulated);

    // Simulation banner
    if (simulated) {
      els.simBanner().hidden = false;
    } else {
      els.simBanner().hidden = true;
    }

    // Show results
    els.resultsSection().hidden = false;
  }

  /** Runs the full analysis cycle with loading state */
  async function runAnalysis(simulated = false) {
    isSimulated = simulated;

    // Parse time
    const timeStr = els.departureTime().value || '22:30';
    let { h, m } = parseTime(timeStr);

    if (simulated) {
      // Shift by +20 minutes
      const totalMins = h * 60 + m + 20;
      h = Math.floor(totalMins / 60);
      m = totalMins % 60;
    }

    // Show loading
    els.loadingState().hidden = false;
    els.resultsSection().hidden = true;

    // Simulate async computation delay (realistic feel)
    await delay(800 + Math.random() * 400);

    // Compute
    const analysis = AnalysisEngine.analyse(h, m, currentMode);

    // Hide loading, show results
    els.loadingState().hidden = true;
    render(analysis, h, m, simulated);
  }

  function delay(ms) { return new Promise(res => setTimeout(res, ms)); }

  /** Bind UI events */
  function init() {
    // Mode toggle
    els.modeButtons().forEach(btn => {
      btn.addEventListener('click', () => {
        currentMode = btn.dataset.mode;
        els.modeButtons().forEach(b => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });
      });
    });

    // Analyse button
    els.analyzeBtn().addEventListener('click', () => runAnalysis(false));

    // Simulate later button
    els.simulateBtn().addEventListener('click', () => runAnalysis(true));

    // Auto-run on load
    runAnalysis(false);
  }

  return { init };
})();

/* ============================================================
   Boot
   ============================================================ */
document.addEventListener('DOMContentLoaded', UI.init);
