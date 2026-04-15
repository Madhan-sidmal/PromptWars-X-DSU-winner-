/**
 * SafeRoute AI – Predictive Risk Navigator
 * v3 – Light theme, mobile-responsive
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
      { id: 's1a', name: 'MG Road Main',         lighting: 0.90, crowdDensity: 0.80, isolation: 0.10, incidentHistory: 0.20, baseRisk: 0.15 },
      { id: 's1b', name: 'Brigade Road Junction', lighting: 0.85, crowdDensity: 0.90, isolation: 0.05, incidentHistory: 0.15, baseRisk: 0.10 },
      { id: 's1c', name: 'Residency Road',        lighting: 0.70, crowdDensity: 0.50, isolation: 0.30, incidentHistory: 0.30, baseRisk: 0.35 },
      { id: 's1d', name: 'Richmond Circle',       lighting: 0.80, crowdDensity: 0.70, isolation: 0.15, incidentHistory: 0.20, baseRisk: 0.20 },
    ],
  },
  {
    id: 'route-1',
    name: 'MG Road → Via Cubbon Park',
    distanceKm: 5.1,
    segments: [
      { id: 's2a', name: 'MG Road Entry',     lighting: 0.90, crowdDensity: 0.80, isolation: 0.10, incidentHistory: 0.20, baseRisk: 0.15 },
      { id: 's2b', name: 'Cubbon Park North', lighting: 0.40, crowdDensity: 0.30, isolation: 0.70, incidentHistory: 0.50, baseRisk: 0.60 },
      { id: 's2c', name: 'Cubbon Park South', lighting: 0.35, crowdDensity: 0.25, isolation: 0.75, incidentHistory: 0.45, baseRisk: 0.55 },
      { id: 's2d', name: 'Kasturba Road',     lighting: 0.75, crowdDensity: 0.60, isolation: 0.20, incidentHistory: 0.25, baseRisk: 0.20 },
    ],
  },
  {
    id: 'route-2',
    name: 'MG Road → Via Commercial St',
    distanceKm: 3.8,
    segments: [
      { id: 's3a', name: 'MG Road Start',      lighting: 0.90, crowdDensity: 0.85, isolation: 0.10, incidentHistory: 0.20, baseRisk: 0.12 },
      { id: 's3b', name: 'Commercial Street',  lighting: 0.80, crowdDensity: 0.95, isolation: 0.05, incidentHistory: 0.30, baseRisk: 0.20 },
      { id: 's3c', name: 'Shivaji Nagar Link', lighting: 0.55, crowdDensity: 0.40, isolation: 0.40, incidentHistory: 0.45, baseRisk: 0.40 },
      { id: 's3d', name: 'Infantry Road',      lighting: 0.75, crowdDensity: 0.65, isolation: 0.20, incidentHistory: 0.20, baseRisk: 0.18 },
    ],
  },
];

const DURATION_MAP = {
  'route-0': { fastest: 18, balanced: 20, safest: 22 },
  'route-1': { fastest: 22, balanced: 24, safest: 26 },
  'route-2': { fastest: 15, balanced: 17, safest: 18 },
};

const ROUTE_PATHS = [
  'M 80 280 Q 160 230, 240 210 Q 330 188, 420 155 Q 490 135, 560 130',
  'M 80 280 Q 130 300, 200 320 Q 310 350, 400 300 Q 490 240, 560 130',
  'M 80 280 Q 120 250, 190 240 Q 270 228, 350 255 Q 450 275, 560 130',
];

const CRITICAL_POSITIONS = [
  { routeIdx: 0, segIdx: 2, x: 310, y: 190 },
  { routeIdx: 1, segIdx: 1, x: 200, y: 315 },
  { routeIdx: 1, segIdx: 2, x: 300, y: 345 },
  { routeIdx: 2, segIdx: 2, x: 360, y: 257 },
];

/* ============================================================
   2. RISK ENGINE
   ============================================================ */

const RiskEngine = (() => {
  function getTimeMultiplier(hour) {
    const h = hour % 24;
    if (h >= 22 || h < 5)  return 1.8;
    if (h >= 20)            return 1.4;
    if (h >= 18)            return 1.1;
    if (h >= 6 && h < 10)  return 0.7;
    return 0.85;
  }

  function getCrowdDecay(minutesFromNow, baseHour) {
    const futureHour = (baseHour + minutesFromNow / 60) % 24;
    if (futureHour >= 22 || futureHour < 5) return 0.20;
    if (futureHour >= 20) return 0.40;
    if (futureHour >= 18) return 0.70;
    if (futureHour >= 7 && futureHour < 9) return 0.90;
    return 0.60;
  }

  function segmentRisk(seg, hour) {
    const timeMul = getTimeMultiplier(hour);
    const raw = (
      seg.baseRisk         * 0.30 +
      (1 - seg.lighting)   * 0.25 +
      (1 - seg.crowdDensity) * 0.20 +
      seg.isolation        * 0.15 +
      seg.incidentHistory  * 0.10
    ) * timeMul;
    return Math.min(1, Math.max(0, raw));
  }

  function classify(score) {
    if (score < 0.30) return 'low';
    if (score < 0.55) return 'moderate';
    if (score < 0.75) return 'high';
    return 'critical';
  }

  function confidence(segments, hour) {
    const risks = segments.map(s => segmentRisk(s, hour));
    const mean = risks.reduce((a, b) => a + b, 0) / risks.length;
    const variance = risks.reduce((sum, r) => sum + (r - mean) ** 2, 0) / risks.length;
    return Math.round((1 - Math.min(variance * 4, 0.6)) * 100);
  }

  return { segmentRisk, classify, confidence, getCrowdDecay };
})();

/* ============================================================
   3. ROUTE CALCULATOR
   ============================================================ */

function calculateRoutes(hour, minute, mode) {
  const currentHour = hour + minute / 60;

  const routes = ROUTE_DATA.map((rd) => {
    const segRisks = rd.segments.map(s => RiskEngine.segmentRisk(s, currentHour));
    const avgRisk  = segRisks.reduce((a, b) => a + b, 0) / segRisks.length;

    const futureRiskScores = [];
    for (let m = 0; m <= 120; m += 15) {
      const futureHour = (currentHour + m / 60) % 24;
      const futureRisks = rd.segments.map(s => {
        const crowdMod = RiskEngine.getCrowdDecay(m, currentHour);
        return RiskEngine.segmentRisk({ ...s, crowdDensity: s.crowdDensity * crowdMod }, futureHour);
      });
      const futureAvg = futureRisks.reduce((a, b) => a + b, 0) / futureRisks.length;
      const fh = Math.floor((hour + Math.floor((minute + m) / 60)) % 24);
      const fm = (minute + m) % 60;
      futureRiskScores.push({
        time:  `${String(fh).padStart(2,'0')}:${String(fm).padStart(2,'0')}`,
        score: Math.round(futureAvg * 100) / 100,
      });
    }

    const criticalSegments = rd.segments
      .map((s, i) => ({ segment: s, risk: segRisks[i] }))
      .filter(({ risk }) => risk > 0.50)
      .map(({ segment, risk }) => {
        const reasons = [];
        if (segment.lighting < 0.5)        reasons.push('low lighting');
        if (segment.isolation > 0.5)       reasons.push('isolated area');
        if (segment.crowdDensity < 0.3)    reasons.push('low foot traffic');
        if (segment.incidentHistory > 0.4) reasons.push('incident history');
        return { segment, reason: `${reasons.join(' + ')} (risk: ${Math.round(risk * 100)}%)` };
      });

    const willBecomeUnsafe = futureRiskScores.some(f => f.score > 0.60 && avgRisk < 0.50);

    const currentLevel = RiskEngine.classify(avgRisk);
    const levelOrder = { low: 0, moderate: 1, high: 2, critical: 3 };
    const transition = futureRiskScores.slice(1).find(
      f => levelOrder[RiskEngine.classify(f.score)] > levelOrder[currentLevel]
    ) || null;

    const dur = DURATION_MAP[rd.id] || { fastest: 20, balanced: 22, safest: 24 };

    return {
      id: rd.id, name: rd.name, distanceKm: rd.distanceKm,
      estimatedMinutes: dur[mode], segments: rd.segments, segRisks,
      riskScore: Math.round(avgRisk * 100) / 100,
      riskLevel: RiskEngine.classify(avgRisk),
      confidence: RiskEngine.confidence(rd.segments, currentHour),
      futureRiskScores, criticalSegments, willBecomeUnsafe, transition,
    };
  });

  return routes.sort((a, b) => {
    if (mode === 'safest')  return a.riskScore - b.riskScore;
    if (mode === 'fastest') return a.estimatedMinutes - b.estimatedMinutes;
    const sA = a.riskScore * 0.6 + (a.estimatedMinutes / 30) * 0.4;
    const sB = b.riskScore * 0.6 + (b.estimatedMinutes / 30) * 0.4;
    return sA - sB;
  });
}

/* ============================================================
   4. MAP RENDERER  (light-theme colors)
   ============================================================ */

const MapRenderer = (() => {
  const RISK_COLORS = {
    low:      '#16a34a',
    moderate: '#d97706',
    high:     '#dc2626',
    critical: '#991b1b',
  };

  function render(routes) {
    const routesG  = document.getElementById('map-routes');
    const markersG = document.getElementById('map-critical-markers');
    routesG.innerHTML  = '';
    markersG.innerHTML = '';

    routes.forEach((route, i) => {
      const color    = RISK_COLORS[route.riskLevel] || '#2563eb';
      const isActive = i === 0;
      const origIdx  = ROUTE_DATA.findIndex(rd => rd.id === route.id);
      const d        = ROUTE_PATHS[origIdx] || ROUTE_PATHS[0];

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', d);
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color);
      path.setAttribute('stroke-width', isActive ? '4' : '2');
      path.setAttribute('stroke-linecap', 'round');
      path.setAttribute('opacity', isActive ? '1' : '0.25');
      if (!isActive) path.setAttribute('stroke-dasharray', '8 6');
      path.classList.add('route-path');
      path.style.animationDelay = `${i * 0.15}s`;
      routesG.appendChild(path);
    });

    // Critical markers for recommended route
    const topRoute = routes[0];
    const origIdx  = ROUTE_DATA.findIndex(rd => rd.id === topRoute.id);
    const positions = CRITICAL_POSITIONS.filter(p => p.routeIdx === origIdx);
    const critSegs  = topRoute.criticalSegments.map(cs => cs.segment.id);

    positions.forEach(pos => {
      const seg = ROUTE_DATA[origIdx].segments[pos.segIdx];
      if (!critSegs.includes(seg.id)) return;

      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');

      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', pos.x); ring.setAttribute('cy', pos.y); ring.setAttribute('r', '16');
      ring.setAttribute('fill', '#dc2626'); ring.setAttribute('opacity', '0.10');
      ring.classList.add('crit-marker-pulse');

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.setAttribute('cx', pos.x); dot.setAttribute('cy', pos.y); dot.setAttribute('r', '5');
      dot.setAttribute('fill', '#dc2626');

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', pos.x); label.setAttribute('y', pos.y - 22);
      label.setAttribute('text-anchor', 'middle'); label.setAttribute('fill', '#b91c1c');
      label.setAttribute('font-size', '9'); label.setAttribute('font-family', 'Plus Jakarta Sans');
      label.setAttribute('font-weight', '700');
      label.textContent = `⚠ ${seg.name}`;

      g.appendChild(ring); g.appendChild(dot); g.appendChild(label);
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
  let departureOffset = 0;
  let selectedCardIdx = 0;

  function getDepartureHourMin() {
    const d     = new Date();
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

    document.getElementById('info-departure').textContent = fmt(h, m);
    document.getElementById('info-mode').textContent =
      currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
    document.getElementById('route-count').textContent = routes.length;

    MapRenderer.render(routes);
    renderRouteCards(routes);
  }

  function renderRouteCards(routes) {
    const list = document.getElementById('routes-list');
    list.innerHTML = '';
    routes.forEach((route, rank) => list.appendChild(buildCard(route, rank)));
  }

  function buildCard(route, rank) {
    const card = document.createElement('article');
    card.className = `route-card${rank === 0 ? ' is-recommended' : ''}${rank === selectedCardIdx ? ' active' : ''}`;
    card.setAttribute('role', 'listitem');
    card.setAttribute('aria-label', route.name);
    card.setAttribute('tabindex', '0');

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
      warn.innerHTML = `<span>📈</span> Risk increases within 2 hours`;
      card.appendChild(warn);
    }

    // Transition prediction
    if (route.transition) {
      const tag = document.createElement('div');
      tag.className = 'future-warning';
      const lvl = RiskEngine.classify(route.transition.score);
      tag.innerHTML = `<span>⚠️</span> Becomes <strong>${lvl}</strong> risk at <strong>${route.transition.time}</strong>`;
      card.appendChild(tag);
    }

    // Critical segments
    if (route.criticalSegments.length > 0) {
      const csWrap = document.createElement('div');
      csWrap.className = 'critical-segments';
      route.criticalSegments.forEach(cs => {
        const el = document.createElement('div');
        el.className = 'crit-seg';
        el.innerHTML = `<span>⚠</span> <span><strong>${cs.segment.name}:</strong> ${cs.reason}</span>`;
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
      const colors = { low: '#16a34a', moderate: '#d97706', high: '#dc2626', critical: '#991b1b' };
      const item  = document.createElement('div');
      item.className = 'seg-bar-item';
      item.innerHTML = `
        <div class="seg-bar-fill" style="background:${colors[level]};opacity:0.55"></div>
        <div class="seg-tooltip">${seg.name} · ${Math.round(risk * 100)}%</div>`;
      bars.appendChild(item);
    });
    card.appendChild(bars);

    // Expanded timeline
    if (rank === selectedCardIdx) {
      card.appendChild(buildTimeline(route));
    }

    // Click to select
    card.addEventListener('click', () => { selectedCardIdx = rank; render(); });
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

      const bar     = document.createElement('div');
      bar.className = `tl-bar ${level}`;
      bar.style.height = `${Math.max(heightPct, 4)}%`;

      const tip       = document.createElement('div');
      tip.className   = 'tl-hover-tip';
      tip.textContent = `${d.time}: ${Math.round(d.score * 100)}%`;

      const timeLabel       = document.createElement('div');
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

  // ---- Mode toggle (syncs desktop + mobile) ----

  function syncModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      const isActive = btn.dataset.mode === currentMode;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-pressed', String(isActive));
    });
  }

  function bindModeToggle() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentMode = btn.dataset.mode;
        selectedCardIdx = 0;
        syncModeButtons();
        render();
      });
    });
  }

  // ---- Simulation ----

  function bindSimulation() {
    const slider  = document.getElementById('departure-slider');
    const display = document.getElementById('sim-display-text');
    const presets = document.querySelectorAll('.preset-btn');
    const simDisp = document.getElementById('sim-display');

    function update(val) {
      departureOffset = Number(val);
      slider.value    = departureOffset;

      display.textContent = departureOffset === 0
        ? 'Leaving now'
        : `Leaving in ${departureOffset} minutes`;

      // Visual feedback: amber tint when offset > 0
      if (departureOffset > 0) {
        simDisp.style.borderColor = '#fde68a';
        simDisp.style.background  = '#fffbeb';
        display.style.color       = '#d97706';
      } else {
        simDisp.style.borderColor = '';
        simDisp.style.background  = '';
        display.style.color       = '';
      }

      presets.forEach(p => {
        const match = Number(p.dataset.offset) === departureOffset;
        p.classList.toggle('active', match);
        p.setAttribute('aria-pressed', String(match));
      });

      render();
    }

    slider.addEventListener('input', () => update(slider.value));
    presets.forEach(p => p.addEventListener('click', () => update(p.dataset.offset)));
  }

  // ---- Init ----

  function init() {
    bindModeToggle();
    bindSimulation();
    render();
    setInterval(render, 60_000);
  }

  return { init };
})();

document.addEventListener('DOMContentLoaded', UI.init);
