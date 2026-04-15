/**
 * SafeRoute AI – Predictive Risk Navigator
 * Merged engine: reference project riskEngine.ts + original SafeRoute logic
 *
 * Modules:
 *  1. ROUTE_DATA      – Bangalore-based simulated segments (with incidentHistory)
 *  2. RiskEngine      – Segment risk calc + time multiplier + crowd decay
 *  3. RouteCalculator – Builds full Route objects with future forecast
 *  4. MapRenderer     – SVG animated route map
 *  5. UIController    – Orchestrates everything
 */

'use strict';

/* ============================================================
   1. ROUTE DATA  (Bangalore, real street names)
   ============================================================ */

const ROUTE_DATA = [
  {
    id: 'route-0',
    name: 'MG Road → Via Brigade Road',
    distanceKm: 4.2,
    segments: [
      { id: 's1a', name: 'MG Road Main',        lighting: 0.90, crowdDensity: 0.80, isolation: 0.10, incidentHistory: 0.20, baseRisk: 0.15 },
      { id: 's1b', name: 'Brigade Road Junction',lighting: 0.85, crowdDensity: 0.90, isolation: 0.05, incidentHistory: 0.15, baseRisk: 0.10 },
      { id: 's1c', name: 'Residency Road',       lighting: 0.70, crowdDensity: 0.50, isolation: 0.30, incidentHistory: 0.30, baseRisk: 0.35 },
      { id: 's1d', name: 'Richmond Circle',      lighting: 0.80, crowdDensity: 0.70, isolation: 0.15, incidentHistory: 0.20, baseRisk: 0.20 },
    ],
  },
  {
    id: 'route-1',
    name: 'MG Road → Via Cubbon Park',
    distanceKm: 5.1,
    segments: [
      { id: 's2a', name: 'MG Road Entry',      lighting: 0.90, crowdDensity: 0.80, isolation: 0.10, incidentHistory: 0.20, baseRisk: 0.15 },
      { id: 's2b', name: 'Cubbon Park North',  lighting: 0.40, crowdDensity: 0.30, isolation: 0.70, incidentHistory: 0.50, baseRisk: 0.60 },
      { id: 's2c', name: 'Cubbon Park South',  lighting: 0.35, crowdDensity: 0.25, isolation: 0.75, incidentHistory: 0.45, baseRisk: 0.55 },
      { id: 's2d', name: 'Kasturba Road',      lighting: 0.75, crowdDensity: 0.60, isolation: 0.20, incidentHistory: 0.25, baseRisk: 0.20 },
    ],
  },
  {
    id: 'route-2',
    name: 'MG Road → Via Commercial St',
    distanceKm: 3.8,
    segments: [
      { id: 's3a', name: 'MG Road Start',       lighting: 0.90, crowdDensity: 0.85, isolation: 0.10, incidentHistory: 0.20, baseRisk: 0.12 },
      { id: 's3b', name: 'Commercial Street',   lighting: 0.80, crowdDensity: 0.95, isolation: 0.05, incidentHistory: 0.30, baseRisk: 0.20 },
      { id: 's3c', name: 'Shivaji Nagar Link',  lighting: 0.55, crowdDensity: 0.40, isolation: 0.40, incidentHistory: 0.45, baseRisk: 0.40 },
      { id: 's3d', name: 'Infantry Road',       lighting: 0.75, crowdDensity: 0.65, isolation: 0.20, incidentHistory: 0.20, baseRisk: 0.18 },
    ],
  },
];

// Duration (minutes) per mode
const DURATION_MAP = {
  'route-0': { fastest: 18, balanced: 20, safest: 22 },
  'route-1': { fastest: 22, balanced: 24, safest: 26 },
  'route-2': { fastest: 15, balanced: 17, safest: 18 },
};

// SVG paths for the 3 routes
const ROUTE_PATHS = [
  'M 80 280 Q 160 230, 240 210 Q 330 188, 420 155 Q 490 135, 560 130',
  'M 80 280 Q 130 300, 200 320 Q 310 350, 400 300 Q 490 240, 560 130',
  'M 80 280 Q 120 250, 190 240 Q 270 228, 350 255 Q 450 275, 560 130',
];

// Critical segment approximate map positions
const CRITICAL_POSITIONS = [
  // route-0: Residency Road (index 2)
  { routeIdx: 0, segIdx: 2, x: 310, y: 190 },
  // route-1: Cubbon Park North (index 1)
  { routeIdx: 1, segIdx: 1, x: 200, y: 315 },
  // route-1: Cubbon Park South (index 2)
  { routeIdx: 1, segIdx: 2, x: 300, y: 345 },
  // route-2: Shivaji Nagar Link (index 2)
  { routeIdx: 2, segIdx: 2, x: 360, y: 257 },
];

/* ============================================================
   2. RISK ENGINE  (ported from reference riskEngine.ts)
   ============================================================ */

const RiskEngine = (() => {
  /**
   * Time multiplier: risk is higher at night, lower in rush hours (more crowd = safer)
   */
  function getTimeMultiplier(hour) {
    const h = hour % 24;
    if (h >= 22 || h < 5)  return 1.8;  // late night
    if (h >= 20)            return 1.4;  // evening
    if (h >= 18)            return 1.1;  // dusk
    if (h >= 6 && h < 10)  return 0.7;  // morning rush (more people = safer)
    return 0.85;                          // daytime
  }

  /**
   * Crowd decay for future forecasting
   */
  function getCrowdDecay(minutesFromNow, baseHour) {
    const futureHour = (baseHour + minutesFromNow / 60) % 24;
    if (futureHour >= 22 || futureHour < 5) return 0.20;
    if (futureHour >= 20) return 0.40;
    if (futureHour >= 18) return 0.70;
    if (futureHour >= 7 && futureHour < 9) return 0.90;
    return 0.60;
  }

  /**
   * Per-segment risk score [0–1]
   * Weighted combination of: baseRisk, lighting, crowdDensity, isolation, incidentHistory
   * Multiplied by time factor
   */
  function segmentRisk(seg, hour) {
    const timeMul = getTimeMultiplier(hour);
    const raw = (
      seg.baseRisk        * 0.30 +
      (1 - seg.lighting)  * 0.25 +
      (1 - seg.crowdDensity) * 0.20 +
      seg.isolation       * 0.15 +
      seg.incidentHistory * 0.10
    ) * timeMul;
    return Math.min(1, Math.max(0, raw));
  }

  /**
   * Classify numeric score into level string
   */
  function classify(score) {
    if (score < 0.30) return 'low';
    if (score < 0.55) return 'moderate';
    if (score < 0.75) return 'high';
    return 'critical';
  }

  /**
   * Confidence = 1 − normalised variance across segment risks
   */
  function confidence(segments, hour) {
    const risks = segments.map(s => segmentRisk(s, hour));
    const mean = risks.reduce((a, b) => a + b, 0) / risks.length;
    const variance = risks.reduce((sum, r) => sum + (r - mean) ** 2, 0) / risks.length;
    return Math.round((1 - Math.min(variance * 4, 0.6)) * 100);
  }

  return { segmentRisk, classify, confidence, getCrowdDecay, getTimeMultiplier };
})();

/* ============================================================
   3. ROUTE CALCULATOR
   ============================================================ */

function calculateRoutes(hour, minute, mode) {
  const currentHour = hour + minute / 60;

  const routes = ROUTE_DATA.map((rd) => {
    const segRisks = rd.segments.map(s => RiskEngine.segmentRisk(s, currentHour));
    const avgRisk  = segRisks.reduce((a, b) => a + b, 0) / segRisks.length;

    // Future risk forecast: every 15 min for 2 hours (9 ticks)
    const futureRiskScores = [];
    for (let m = 0; m <= 120; m += 15) {
      const futureHour = (currentHour + m / 60) % 24;
      const futureRisks = rd.segments.map(s => {
        const crowdMod = RiskEngine.getCrowdDecay(m, currentHour);
        return RiskEngine.segmentRisk(
          { ...s, crowdDensity: s.crowdDensity * crowdMod },
          futureHour
        );
      });
      const futureAvg = futureRisks.reduce((a, b) => a + b, 0) / futureRisks.length;
      const fh  = Math.floor((hour + Math.floor((minute + m) / 60)) % 24);
      const fm  = (minute + m) % 60;
      futureRiskScores.push({
        time:  `${String(fh).padStart(2,'0')}:${String(fm).padStart(2,'0')}`,
        score: Math.round(futureAvg * 100) / 100,
      });
    }

    // Critical segments (risk > 0.50)
    const criticalSegments = rd.segments
      .map((s, i) => ({ segment: s, risk: segRisks[i] }))
      .filter(({ risk }) => risk > 0.50)
      .map(({ segment, risk }) => {
        const reasons = [];
        if (segment.lighting < 0.5)        reasons.push('low lighting');
        if (segment.isolation > 0.5)       reasons.push('isolated area');
        if (segment.crowdDensity < 0.3)   reasons.push('low foot traffic');
        if (segment.incidentHistory > 0.4) reasons.push('incident history');
        return {
          segment,
          reason: `${reasons.join(' + ')} (risk: ${Math.round(risk * 100)}%)`,
        };
      });

    // Will it become unsafe in next 2 hours?
    const willBecomeUnsafe = futureRiskScores.some(
      f => f.score > 0.60 && avgRisk < 0.50
    );

    // When does it first become worse?
    const currentLevel = RiskEngine.classify(avgRisk);
    const levelOrder = { low: 0, moderate: 1, high: 2, critical: 3 };
    const transition = futureRiskScores.slice(1).find(
      f => levelOrder[RiskEngine.classify(f.score)] > levelOrder[currentLevel]
    ) || null;

    const dur = DURATION_MAP[rd.id] || { fastest: 20, balanced: 22, safest: 24 };

    return {
      id:               rd.id,
      name:             rd.name,
      distanceKm:       rd.distanceKm,
      estimatedMinutes: dur[mode],
      segments:         rd.segments,
      segRisks,
      riskScore:        Math.round(avgRisk * 100) / 100,
      riskLevel:        RiskEngine.classify(avgRisk),
      confidence:       RiskEngine.confidence(rd.segments, currentHour),
      futureRiskScores,
      criticalSegments,
      willBecomeUnsafe,
      transition,
    };
  });

  // Sort by mode
  return routes.sort((a, b) => {
    if (mode === 'safest')  return a.riskScore - b.riskScore;
    if (mode === 'fastest') return a.estimatedMinutes - b.estimatedMinutes;
    // balanced
    const sA = a.riskScore * 0.6 + (a.estimatedMinutes / 30) * 0.4;
    const sB = b.riskScore * 0.6 + (b.estimatedMinutes / 30) * 0.4;
    return sA - sB;
  });
}

/* ============================================================
   4. MAP RENDERER (SVG animated map)
   ============================================================ */

const MapRenderer = (() => {
  const RISK_COLORS = {
    low:      '#22a861',
    moderate: '#d97706',
    high:     '#dc4a4a',
    critical: '#b91c1c',
  };

  function render(routes, selectedIdx) {
    const routesG  = document.getElementById('map-routes');
    const markersG = document.getElementById('map-critical-markers');
    routesG.innerHTML  = '';
    markersG.innerHTML = '';

    // 1. Draw all paths (dimmed), selected on top + animated
    routes.forEach((route, i) => {
      const color    = RISK_COLORS[route.riskLevel] || '#3b82f6';
      const isActive = i === 0; // first in sorted list = recommended/selected
      const path     = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      // Find original index
      const origIdx  = ROUTE_DATA.findIndex(rd => rd.id === route.id);
      const d        = ROUTE_PATHS[origIdx] || ROUTE_PATHS[0];

      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', isActive ? '4' : '2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('opacity', isActive ? '1' : '0.22');
      if (!isActive) path.setAttribute('stroke-dasharray', '8 6');
      path.classList.add('route-path');
      path.style.animationDelay = `${i * 0.15}s`;
      routesG.appendChild(path);
    });

    // 2. Critical markers (for recommended/first route)
    const topRoute  = routes[0];
    const origIdx   = ROUTE_DATA.findIndex(rd => rd.id === topRoute.id);
    const positions = CRITICAL_POSITIONS.filter(p => p.routeIdx === origIdx);
    const critSegs  = topRoute.criticalSegments.map(cs => cs.segment.id);

    positions.forEach(pos => {
      const seg = ROUTE_DATA[origIdx].segments[pos.segIdx];
      if (!critSegs.includes(seg.id)) return;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      g.style.animation = 'fade-in 0.5s ease 1s both';

      // Pulse ring
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', pos.x); ring.setAttribute('cy', pos.y); ring.setAttribute('r', '16');
      ring.setAttribute('fill', 'hsl(0,65%,55%)');
      ring.setAttribute('opacity', '0.12');
      ring.classList.add('crit-marker-pulse');

      // Dot
      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', pos.x); dot.setAttribute('cy', pos.y); dot.setAttribute('r', '6');
      dot.setAttribute('fill', 'hsl(0,65%,55%)');

      // Label
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', pos.x); label.setAttribute('y', pos.y - 22);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', 'hsl(0,65%,45%)');
      label.setAttribute('font-size', '9');
      label.setAttribute('font-family', 'Plus Jakarta Sans');
      label.setAttribute('font-weight', '700');
      label.textContent = `⚠ ${seg.name}`;

      g.appendChild(ring);
      g.appendChild(dot);
      g.appendChild(label);
      markersG.appendChild(g);
    });
  }

  return { render };
})();

/* ============================================================
   5. UI CONTROLLER
   ============================================================ */

const UI = (() => {
  let currentMode     = 'safest';
  let departureOffset = 0;   // minutes from now
  let selectedCardIdx = 0;   // which card is expanded

  // ---- Helpers ----

  function now() {
    return new Date();
  }

  function getDepartureHourMin() {
    const d    = now();
    const total = d.getHours() * 60 + d.getMinutes() + departureOffset;
    return { h: Math.floor(total / 60) % 24, m: total % 60 };
  }

  function fmt(h, m) {
    return `${String(h % 24).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  // ---- Render ----

  function render() {
    const { h, m } = getDepartureHourMin();
    const routes    = calculateRoutes(h, m, currentMode);

    // Update info bar
    document.getElementById('info-departure').textContent = fmt(h, m);
    document.getElementById('info-mode').textContent =
      currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
    document.getElementById('route-count').textContent = routes.length;

    // SVG map
    MapRenderer.render(routes, selectedCardIdx);

    // Route cards
    renderRouteCards(routes);
  }

  function renderRouteCards(routes) {
    const list = document.getElementById('routes-list');
    list.innerHTML = '';

    routes.forEach((route, rank) => {
      const card = buildCard(route, rank);
      list.appendChild(card);
    });
  }

  function buildCard(route, rank) {
    const card = document.createElement('article');
    card.className = `route-card${rank === 0 ? ' is-recommended' : ''}${rank === selectedCardIdx ? ' active' : ''}`;
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', route.name);
    card.setAttribute('tabindex', '0');
    card.setAttribute('data-rank', rank);

    // Header
    const header = document.createElement('div');
    header.className = 'rc-header';

    const nameCol = document.createElement('div');
    nameCol.innerHTML = `
      <div class="rc-name">${route.name}</div>
      <div class="rc-meta">
        <span class="rc-meta-item">⏱ ${route.estimatedMinutes} min</span>
        <span class="rc-meta-item">📍 ${route.distanceKm} km</span>
      </div>`;

    const badges = document.createElement('div');
    badges.className = 'rc-badges';
    badges.innerHTML = `
      <span class="risk-badge ${route.riskLevel}">${route.riskLevel}</span>
      <span class="confidence-badge">🛡 ${route.confidence}%</span>`;

    header.appendChild(nameCol);
    header.appendChild(badges);
    card.appendChild(header);

    // Future risk warning
    if (route.willBecomeUnsafe) {
      const warn = document.createElement('div');
      warn.className = 'future-warning';
      warn.innerHTML = `<span aria-hidden="true">📈</span> Risk increases within 2 hours`;
      card.appendChild(warn);
    }

    // Prediction tag (when does it get worse)
    if (route.transition) {
      const tag = document.createElement('div');
      tag.className = 'future-warning';
      tag.innerHTML = `<span aria-hidden="true">⚠️</span> Becomes <strong>${route.transition.level || RiskEngine.classify(route.transition.score)}</strong> risk at <strong>${route.transition.time}</strong>`;
      card.appendChild(tag);
    }

    // Critical segments
    if (route.criticalSegments.length > 0) {
      const csWrap = document.createElement('div');
      csWrap.className = 'critical-segments';
      route.criticalSegments.forEach(cs => {
        const el = document.createElement('div');
        el.className = 'crit-seg';
        el.innerHTML = `<span aria-hidden="true">⚠</span> <span><strong>${cs.segment.name}:</strong> ${cs.reason}</span>`;
        csWrap.appendChild(el);
      });
      card.appendChild(csWrap);
    }

    // Segment risk bars
    const bars = document.createElement('div');
    bars.className = 'seg-bars';
    route.segments.forEach((seg, i) => {
      const risk  = route.segRisks[i];
      const level = RiskEngine.classify(risk);
      const color = level === 'low' ? 'var(--risk-low)' : level === 'moderate' ? 'var(--risk-mod)' : 'var(--risk-high)';
      const item  = document.createElement('div');
      item.className = 'seg-bar-item';
      item.innerHTML = `
        <div class="seg-bar-fill" style="background:${color};opacity:0.65;height:5px;border-radius:100px"></div>
        <div class="seg-tooltip">${seg.name} · ${Math.round(risk * 100)}%</div>`;
      bars.appendChild(item);
    });
    card.appendChild(bars);

    // Expanded timeline (if this is selected)
    if (rank === selectedCardIdx) {
      card.appendChild(buildTimeline(route));
    }

    // Click to select
    card.addEventListener('click', () => {
      selectedCardIdx = rank;
      render();
    });
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { selectedCardIdx = rank; render(); }
    });

    return card;
  }

  function buildTimeline(route) {
    const wrap = document.createElement('div');
    wrap.className = 'rc-timeline';

    const title = document.createElement('div');
    title.className = 'rc-timeline-title';
    title.textContent = 'Risk Forecast – Next 2 Hours';
    wrap.appendChild(title);

    const barsWrap = document.createElement('div');
    barsWrap.className = 'timeline-bars-wrap';

    const maxScore = Math.max(...route.futureRiskScores.map(d => d.score), 0.01);

    route.futureRiskScores.forEach((d, i) => {
      const heightPct = (d.score / Math.max(maxScore, 0.8)) * 100;
      const level     = RiskEngine.classify(d.score);
      const col       = document.createElement('div');
      col.className   = 'tl-bar-col';

      const bar = document.createElement('div');
      bar.className = `tl-bar ${level}`;
      bar.style.height = `${Math.max(heightPct, 4)}%`;
      bar.style.width  = '100%';

      const tip = document.createElement('div');
      tip.className   = 'tl-hover-tip';
      tip.textContent = `${d.time}: ${Math.round(d.score * 100)}%`;

      const timeLabel = document.createElement('div');
      timeLabel.className   = 'tl-time';
      timeLabel.textContent = i % 2 === 0 ? d.time : '';

      col.appendChild(tip);
      col.appendChild(bar);
      col.appendChild(timeLabel);
      barsWrap.appendChild(col);
    });

    wrap.appendChild(barsWrap);
    return wrap;
  }

  // ---- Event bindings ----

  function bindModeToggle() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentMode = btn.dataset.mode;
        document.querySelectorAll('.mode-btn').forEach(b => {
          b.classList.toggle('active', b === btn);
          b.setAttribute('aria-pressed', String(b === btn));
        });
        selectedCardIdx = 0;
        render();
      });
    });
  }

  function bindSimulation() {
    const slider   = document.getElementById('departure-slider');
    const display  = document.getElementById('sim-display-text');
    const presets  = document.querySelectorAll('.preset-btn');

    function update(val) {
      departureOffset = Number(val);
      slider.value    = departureOffset;

      // Update display text
      display.textContent = departureOffset === 0
        ? 'Leaving now'
        : `Leaving in ${departureOffset} minutes`;

      // Update sim-display border color
      const simDisp = document.getElementById('sim-display');
      simDisp.style.borderColor = departureOffset > 0
        ? 'rgba(217,119,6,0.4)'
        : 'rgba(59,130,246,0.2)';
      simDisp.style.background = departureOffset > 0
        ? 'rgba(217,119,6,0.07)'
        : 'rgba(59,130,246,0.08)';
      document.getElementById('sim-display-text').style.color = departureOffset > 0
        ? 'var(--risk-mod)'
        : 'var(--blue-light)';

      // Sync presets
      presets.forEach(p => {
        const match = Number(p.dataset.offset) === departureOffset;
        p.classList.toggle('active', match);
        p.setAttribute('aria-pressed', String(match));
      });

      render();
    }

    slider.addEventListener('input', () => update(slider.value));

    presets.forEach(p => {
      p.addEventListener('click', () => update(p.dataset.offset));
    });
  }

  // ---- Init ----

  function init() {
    bindModeToggle();
    bindSimulation();
    render();

    // Live clock update every 60s
    setInterval(render, 60_000);
  }

  return { init };
})();

/* ============================================================
   Boot
   ============================================================ */
document.addEventListener('DOMContentLoaded', UI.init);
