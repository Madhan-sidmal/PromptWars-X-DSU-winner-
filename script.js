/**
 * SafeRoute AI – Predictive Risk Navigator v4
 * Google Maps Integration + Predictive Risk Engine Overlay
 *
 * Flow:
 *  1. Google Maps renders base map
 *  2. Geolocation detects user position
 *  3. Places Autocomplete on destination input
 *  4. Directions API fetches up to 3 alternative routes
 *  5. Risk Engine scores each route with time-aware safety analysis
 *  6. UI overlays intelligence on top of Google's routes
 */

'use strict';

/* ============================================================
   GLOBALS (set by Google Maps callback)
   ============================================================ */
let map, directionsService, directionsRenderers = [];
let originAutocomplete, destAutocomplete;
let userLocation = null;
let currentRoutes = [];  // analysed route objects
let rawDirectionsResults = [];  // raw Google route legs

/* ============================================================
   CONFIG
   ============================================================ */
const ROUTE_COLORS = {
  low:      '#16a34a',
  moderate: '#d97706',
  high:     '#dc2626',
  critical: '#991b1b',
};

const DEFAULT_CENTER = { lat: 12.9716, lng: 77.5946 }; // Bangalore

/* ============================================================
   1. RISK ENGINE (time-aware, overlays on any route)
   ============================================================ */

const RiskEngine = (() => {
  /**
   * Simulates segment-level risk for a Google route leg.
   * Since real segment data (lighting, isolation) isn't available from
   * Directions API, we derive risk heuristics from:
   *  - Time of day (night = higher risk)
   *  - Route duration (longer = more exposure)
   *  - Step count & types (highways safer, local roads riskier)
   *  - Distance through urban areas
   */

  function getTimeMultiplier(hour) {
    const h = hour % 24;
    if (h >= 22 || h < 5)  return 1.8;
    if (h >= 20)            return 1.4;
    if (h >= 18)            return 1.1;
    if (h >= 6 && h < 10)  return 0.7;
    return 0.85;
  }

  function getCrowdDecay(minutesFromNow, baseHour) {
    const fh = (baseHour + minutesFromNow / 60) % 24;
    if (fh >= 22 || fh < 5)  return 0.20;
    if (fh >= 20)             return 0.40;
    if (fh >= 18)             return 0.70;
    if (fh >= 7 && fh < 9)   return 0.90;
    return 0.60;
  }

  /**
   * Analyse a single step of a Google route and assign a risk score.
   * Uses road type keywords and distance as heuristics.
   */
  function analyseStep(step, hour) {
    const instructions = (step.instructions || '').toLowerCase();
    const distM = step.distance ? step.distance.value : 200;
    const timeMul = getTimeMultiplier(hour);

    // Base risk from road type heuristics
    let baseRisk = 0.30;
    let lighting = 0.65;
    let isolation = 0.30;
    let crowd = 0.55;

    // Highway / main road = safer
    if (instructions.includes('highway') || instructions.includes('nh')  ||
        instructions.includes('national') || instructions.includes('expressway')) {
      baseRisk = 0.12; lighting = 0.85; isolation = 0.10; crowd = 0.70;
    }
    // Major named road
    else if (instructions.includes('main') || instructions.includes('mg road') ||
             instructions.includes('brigade') || instructions.includes('ring road')) {
      baseRisk = 0.18; lighting = 0.80; isolation = 0.15; crowd = 0.75;
    }
    // Park / garden area
    else if (instructions.includes('park') || instructions.includes('garden') ||
             instructions.includes('lake')) {
      baseRisk = 0.50; lighting = 0.35; isolation = 0.70; crowd = 0.25;
    }
    // Residential / back lane
    else if (instructions.includes('cross') || instructions.includes('lane') ||
             instructions.includes('galli') || instructions.includes('layout')) {
      baseRisk = 0.40; lighting = 0.45; isolation = 0.55; crowd = 0.35;
    }
    // Service road / underpass
    else if (instructions.includes('underpass') || instructions.includes('flyover') ||
             instructions.includes('service')) {
      baseRisk = 0.45; lighting = 0.40; isolation = 0.60; crowd = 0.30;
    }

    // Longer segments = more exposure
    const distFactor = Math.min(distM / 2000, 0.15);

    const crowdNow = crowd * getCrowdDecay(0, hour);
    const risk = (
      baseRisk * 0.30 +
      (1 - lighting) * 0.25 +
      (1 - crowdNow) * 0.20 +
      isolation * 0.15 +
      distFactor * 0.10
    ) * timeMul;

    return {
      risk: Math.min(1, Math.max(0, risk)),
      name: stripHTML(step.instructions || 'Unnamed segment').substring(0, 60),
      lighting,
      isolation,
      crowd,
      distM,
    };
  }

  /**
   * Score an entire Google route (a leg with multiple steps)
   */
  function scoreRoute(leg, hour) {
    const steps = leg.steps || [];
    if (steps.length === 0) return { score: 0.5, level: 'moderate', segments: [], confidence: 50 };

    const segments = steps.map(step => analyseStep(step, hour));
    const risks = segments.map(s => s.risk);

    // Weighted average by distance
    const totalDist = segments.reduce((sum, s) => sum + s.distM, 0) || 1;
    const weightedRisk = segments.reduce((sum, s) => sum + s.risk * s.distM, 0) / totalDist;

    // Confidence from variance
    const mean = risks.reduce((a, b) => a + b, 0) / risks.length;
    const variance = risks.reduce((sum, r) => sum + (r - mean) ** 2, 0) / risks.length;
    const confidence = Math.round((1 - Math.min(variance * 4, 0.6)) * 100);

    return {
      score: Math.round(weightedRisk * 100) / 100,
      level: classify(weightedRisk),
      segments,
      confidence,
    };
  }

  /**
   * Future forecast: project risk for the next 2 hours (9 ticks at 15-min intervals)
   */
  function forecast(leg, startHour, startMin) {
    const ticks = [];
    for (let m = 0; m <= 120; m += 15) {
      const futureH = (startHour + (startMin + m) / 60) % 24;
      const result = scoreRoute(leg, futureH);
      const h = Math.floor((startHour + Math.floor((startMin + m) / 60)) % 24);
      const min = (startMin + m) % 60;
      ticks.push({
        time: `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}`,
        score: result.score,
        level: result.level,
      });
    }
    return ticks;
  }

  function classify(score) {
    if (score < 0.30) return 'low';
    if (score < 0.55) return 'moderate';
    if (score < 0.75) return 'high';
    return 'critical';
  }

  function stripHTML(html) {
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return tmp.textContent || tmp.innerText || '';
  }

  return { scoreRoute, forecast, classify, getCrowdDecay };
})();

/* ============================================================
   2. GOOGLE MAPS INIT (called by API callback)
   ============================================================ */

function onMapsReady() {
  // Init map
  map = new google.maps.Map(document.getElementById('google-map'), {
    center: DEFAULT_CENTER,
    zoom: 13,
    disableDefaultUI: true,
    zoomControl: true,
    mapTypeControl: false,
    streetViewControl: false,
    styles: [
      { featureType: 'poi', stylers: [{ visibility: 'simplified' }] },
      { featureType: 'transit', stylers: [{ visibility: 'off' }] },
    ],
  });

  directionsService = new google.maps.DirectionsService();

  // Init Places Autocomplete
  const originInput = document.getElementById('input-origin');
  const destInput   = document.getElementById('input-dest');

  originAutocomplete = new google.maps.places.Autocomplete(originInput, {
    types: ['geocode', 'establishment'],
    componentRestrictions: { country: 'in' },
  });

  destAutocomplete = new google.maps.places.Autocomplete(destInput, {
    types: ['geocode', 'establishment'],
    componentRestrictions: { country: 'in' },
  });

  // Auto-detect user location
  detectLocation();

  // Boot UI
  UI.init();
}

/* ============================================================
   3. GEOLOCATION
   ============================================================ */

function detectLocation() {
  const statusEl = document.getElementById('search-status');

  if (!navigator.geolocation) {
    statusEl.innerHTML = '<span class="status-error">⚠ Geolocation not supported. Enter origin manually.</span>';
    return;
  }

  statusEl.innerHTML = '<span class="status-loading">📍 Detecting your location...</span>';

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      map.setCenter(userLocation);
      map.setZoom(14);

      // Reverse geocode to show address
      const geocoder = new google.maps.Geocoder();
      geocoder.geocode({ location: userLocation }, (results, status) => {
        const originInput = document.getElementById('input-origin');
        if (status === 'OK' && results[0]) {
          originInput.value = results[0].formatted_address;
          statusEl.innerHTML = '<span class="status-success">✓ Location detected. Enter a destination.</span>';
        } else {
          originInput.value = `${userLocation.lat.toFixed(4)}, ${userLocation.lng.toFixed(4)}`;
          statusEl.innerHTML = '<span class="status-success">✓ Location detected.</span>';
        }
      });

      // Add user marker
      new google.maps.Marker({
        position: userLocation,
        map: map,
        icon: {
          path: google.maps.SymbolPath.CIRCLE,
          scale: 8,
          fillColor: '#2563eb',
          fillOpacity: 1,
          strokeColor: '#ffffff',
          strokeWeight: 3,
        },
        title: 'You are here',
      });
    },
    (err) => {
      statusEl.innerHTML = '<span class="status-error">⚠ Location denied. Enter origin manually.</span>';
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

/* ============================================================
   4. DIRECTIONS + RISK ANALYSIS
   ============================================================ */

function findRoutes(origin, destination) {
  const statusEl = document.getElementById('search-status');
  const btnSearch = document.getElementById('btn-search');

  if (!origin || !destination) {
    statusEl.innerHTML = '<span class="status-error">⚠ Please enter both origin and destination.</span>';
    return;
  }

  statusEl.innerHTML = '<span class="status-loading">🔍 Fetching routes & analyzing safety...</span>';
  btnSearch.disabled = true;

  // Clear old renderers
  directionsRenderers.forEach(r => r.setMap(null));
  directionsRenderers = [];

  directionsService.route(
    {
      origin: origin,
      destination: destination,
      travelMode: google.maps.TravelMode.DRIVING,
      provideRouteAlternatives: true,
      unitSystem: google.maps.UnitSystem.METRIC,
    },
    (result, status) => {
      btnSearch.disabled = false;

      if (status !== 'OK' || !result.routes || result.routes.length === 0) {
        statusEl.innerHTML = `<span class="status-error">⚠ No routes found (${status}). Try different locations.</span>`;
        return;
      }

      rawDirectionsResults = result.routes;
      statusEl.innerHTML = `<span class="status-success">✓ ${result.routes.length} route(s) found. Analyzing safety...</span>`;

      // Analyse and render
      analyseAndRender(result);

      setTimeout(() => {
        statusEl.innerHTML = `<span class="status-success">✓ Analysis complete — ${currentRoutes.length} routes scored.</span>`;
      }, 300);
    }
  );
}

function analyseAndRender(directionsResult) {
  const { h, m } = UI.getDepartureHourMin();
  const mode = UI.getMode();

  // Build analysed routes
  currentRoutes = directionsResult.routes.map((route, idx) => {
    const leg = route.legs[0];
    const analysis = RiskEngine.scoreRoute(leg, h + m / 60);
    const futureForecast = RiskEngine.forecast(leg, h, m);

    // Critical segments (risk > 0.55)
    const criticalSegments = analysis.segments
      .filter(s => s.risk > 0.55)
      .slice(0, 3)
      .map(s => {
        const reasons = [];
        if (s.lighting < 0.5) reasons.push('low lighting');
        if (s.isolation > 0.5) reasons.push('isolated');
        if (s.crowd < 0.35) reasons.push('low foot traffic');
        return { name: s.name, reason: reasons.join(' + ') || 'elevated risk', risk: s.risk };
      });

    // Future risk transition
    const currentLevel = analysis.level;
    const levelOrder = { low: 0, moderate: 1, high: 2, critical: 3 };
    const transition = futureForecast.slice(1).find(
      t => levelOrder[t.level] > levelOrder[currentLevel]
    ) || null;

    const willBecomeUnsafe = futureForecast.some(
      t => t.score > 0.60 && analysis.score < 0.50
    );

    return {
      id: idx,
      googleRoute: route,
      name: route.summary || `Route ${String.fromCharCode(65 + idx)}`,
      distanceKm: (leg.distance.value / 1000).toFixed(1),
      estimatedMinutes: Math.round(leg.duration.value / 60),
      riskScore: analysis.score,
      riskLevel: analysis.level,
      confidence: analysis.confidence,
      segments: analysis.segments,
      criticalSegments,
      futureRiskScores: futureForecast,
      transition,
      willBecomeUnsafe,
    };
  });

  // Sort by mode
  currentRoutes.sort((a, b) => {
    if (mode === 'safest')  return a.riskScore - b.riskScore;
    if (mode === 'fastest') return a.estimatedMinutes - b.estimatedMinutes;
    const sA = a.riskScore * 0.6 + (a.estimatedMinutes / 60) * 0.4;
    const sB = b.riskScore * 0.6 + (b.estimatedMinutes / 60) * 0.4;
    return sA - sB;
  });

  // Render on map
  renderRoutesOnMap(currentRoutes);

  // Render cards
  UI.renderCards(currentRoutes);
}

function renderRoutesOnMap(routes) {
  // Clear old
  directionsRenderers.forEach(r => r.setMap(null));
  directionsRenderers = [];

  routes.forEach((route, idx) => {
    const color = ROUTE_COLORS[route.riskLevel] || '#2563eb';
    const isTop = idx === 0;

    const renderer = new google.maps.DirectionsRenderer({
      map: map,
      directions: { routes: rawDirectionsResults, request: {} },
      routeIndex: route.id,  // original index in Google results
      suppressMarkers: false,
      preserveViewport: idx > 0,
      polylineOptions: {
        strokeColor: color,
        strokeWeight: isTop ? 6 : 3,
        strokeOpacity: isTop ? 0.9 : 0.35,
      },
    });

    // Fix: set the directions result properly
    const fakeResult = {
      routes: [rawDirectionsResults[route.id]],
      geocoded_waypoints: [],
    };

    renderer.setDirections({
      ...fakeResult,
      request: {
        origin: rawDirectionsResults[route.id].legs[0].start_location,
        destination: rawDirectionsResults[route.id].legs[0].end_location,
        travelMode: 'DRIVING',
      },
    });

    directionsRenderers.push(renderer);
  });

  // Fit bounds to first route
  if (routes.length > 0) {
    const bounds = new google.maps.LatLngBounds();
    const leg = routes[0].googleRoute.legs[0];
    bounds.extend(leg.start_location);
    bounds.extend(leg.end_location);
    routes[0].googleRoute.overview_path.forEach(p => bounds.extend(p));
    map.fitBounds(bounds, { top: 40, bottom: 40, left: 40, right: 40 });
  }
}

/* ============================================================
   5. UI CONTROLLER
   ============================================================ */

const UI = (() => {
  let currentMode = 'safest';
  let departureOffset = 0;
  let selectedCardIdx = 0;

  function getMode() { return currentMode; }

  function getDepartureHourMin() {
    const d = new Date();
    const total = d.getHours() * 60 + d.getMinutes() + departureOffset;
    return { h: Math.floor(total / 60) % 24, m: total % 60 };
  }

  function fmt(h, m) {
    return `${String(h % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function updateInfoBar() {
    const { h, m } = getDepartureHourMin();
    document.getElementById('info-departure').textContent = departureOffset === 0 ? 'Now' : fmt(h, m);
    document.getElementById('info-mode').textContent = currentMode.charAt(0).toUpperCase() + currentMode.slice(1);
    document.getElementById('info-route-count').textContent = currentRoutes.length || '—';
    document.getElementById('route-count').textContent = currentRoutes.length;
  }

  function renderCards(routes) {
    const list = document.getElementById('routes-list');
    list.innerHTML = '';
    selectedCardIdx = 0;

    if (routes.length === 0) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🗺️</div><p class="empty-text">Enter a destination and click <strong>Find Routes</strong></p></div>`;
      return;
    }

    routes.forEach((route, rank) => list.appendChild(buildCard(route, rank)));
    updateInfoBar();
  }

  function buildCard(route, rank) {
    const card = document.createElement('article');
    card.className = `route-card${rank === 0 ? ' is-recommended' : ''}${rank === selectedCardIdx ? ' active' : ''}`;
    card.setAttribute('role', 'listitem');
    card.setAttribute('tabindex', '0');

    const header = document.createElement('div');
    header.className = 'rc-header';
    header.innerHTML = `
      <div>
        <div class="rc-name">${route.name}</div>
        <div class="rc-meta">
          <span class="rc-meta-item">⏱ ${route.estimatedMinutes} min</span>
          <span class="rc-meta-item">📍 ${route.distanceKm} km</span>
        </div>
      </div>
      <div class="rc-badges">
        <span class="risk-badge ${route.riskLevel}">${route.riskLevel}</span>
        <span class="confidence-badge">🛡 ${route.confidence}%</span>
      </div>`;
    card.appendChild(header);

    // Future warning
    if (route.willBecomeUnsafe) {
      const warn = document.createElement('div');
      warn.className = 'future-warning';
      warn.innerHTML = '<span>📈</span> Risk increases within 2 hours';
      card.appendChild(warn);
    }

    if (route.transition) {
      const tag = document.createElement('div');
      tag.className = 'future-warning';
      tag.innerHTML = `<span>⚠️</span> Becomes <strong>${route.transition.level}</strong> risk at <strong>${route.transition.time}</strong>`;
      card.appendChild(tag);
    }

    // Critical segments
    if (route.criticalSegments.length > 0) {
      const csWrap = document.createElement('div');
      csWrap.className = 'critical-segments';
      route.criticalSegments.forEach(cs => {
        const el = document.createElement('div');
        el.className = 'crit-seg';
        el.innerHTML = `<span>⚠</span> <span><strong>${cs.name}:</strong> ${cs.reason} (${Math.round(cs.risk * 100)}%)</span>`;
        csWrap.appendChild(el);
      });
      card.appendChild(csWrap);
    }

    // Timeline (always for selected card)
    if (rank === selectedCardIdx) {
      card.appendChild(buildTimeline(route));
    }

    card.addEventListener('click', () => {
      selectedCardIdx = rank;
      renderCards(currentRoutes);
      // Highlight on map
      renderRoutesOnMap(currentRoutes);
    });

    return card;
  }

  function buildTimeline(route) {
    const wrap = document.createElement('div');
    wrap.className = 'rc-timeline';
    wrap.innerHTML = '<div class="rc-timeline-title">Risk Forecast – Next 2 Hours</div>';

    const barsWrap = document.createElement('div');
    barsWrap.className = 'timeline-bars-wrap';

    const maxScore = Math.max(...route.futureRiskScores.map(d => d.score), 0.01);

    route.futureRiskScores.forEach((d, i) => {
      const heightPct = (d.score / Math.max(maxScore, 0.8)) * 100;
      const col = document.createElement('div');
      col.className = 'tl-bar-col';
      col.innerHTML = `
        <div class="tl-hover-tip">${d.time}: ${Math.round(d.score * 100)}%</div>
        <div class="tl-bar ${d.level}" style="height:${Math.max(heightPct, 4)}%"></div>
        <div class="tl-time">${i % 2 === 0 ? d.time : ''}</div>`;
      barsWrap.appendChild(col);
    });

    wrap.appendChild(barsWrap);
    return wrap;
  }

  // ---- Mode toggle ----
  function syncModeButtons() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.mode === currentMode);
      btn.setAttribute('aria-pressed', String(btn.dataset.mode === currentMode));
    });
  }

  function bindModeToggle() {
    document.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        currentMode = btn.dataset.mode;
        syncModeButtons();
        updateInfoBar();
        if (currentRoutes.length > 0) {
          // Re-sort and re-render
          currentRoutes.sort((a, b) => {
            if (currentMode === 'safest')  return a.riskScore - b.riskScore;
            if (currentMode === 'fastest') return a.estimatedMinutes - b.estimatedMinutes;
            const sA = a.riskScore * 0.6 + (a.estimatedMinutes / 60) * 0.4;
            const sB = b.riskScore * 0.6 + (b.estimatedMinutes / 60) * 0.4;
            return sA - sB;
          });
          renderCards(currentRoutes);
          renderRoutesOnMap(currentRoutes);
        }
      });
    });
  }

  // ---- Simulation ----
  function bindSimulation() {
    const slider  = document.getElementById('departure-slider');
    const display = document.getElementById('sim-display-text');
    const simDisp = document.getElementById('sim-display');
    const presets = document.querySelectorAll('.preset-btn');

    function update(val) {
      departureOffset = Number(val);
      slider.value = departureOffset;

      display.textContent = departureOffset === 0
        ? 'Leaving now'
        : `Leaving in ${departureOffset} minutes`;

      if (departureOffset > 0) {
        simDisp.style.borderColor = '#fde68a';
        simDisp.style.background = '#fffbeb';
        display.style.color = '#d97706';
      } else {
        simDisp.style.borderColor = '';
        simDisp.style.background = '';
        display.style.color = '';
      }

      presets.forEach(p => {
        const match = Number(p.dataset.offset) === departureOffset;
        p.classList.toggle('active', match);
        p.setAttribute('aria-pressed', String(match));
      });

      updateInfoBar();

      // Re-analyse if we have routes
      if (rawDirectionsResults.length > 0) {
        analyseAndRender({ routes: rawDirectionsResults });
      }
    }

    slider.addEventListener('input', () => update(slider.value));
    presets.forEach(p => p.addEventListener('click', () => update(p.dataset.offset)));
  }

  // ---- Search ----
  function bindSearch() {
    const btn = document.getElementById('btn-search');
    const originInput = document.getElementById('input-origin');
    const destInput = document.getElementById('input-dest');

    btn.addEventListener('click', () => {
      findRoutes(originInput.value, destInput.value);
    });

    // Enter key
    destInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        findRoutes(originInput.value, destInput.value);
      }
    });
    originInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        destInput.focus();
      }
    });
  }

  // ---- Init ----
  function init() {
    bindModeToggle();
    bindSimulation();
    bindSearch();
    updateInfoBar();
  }

  return { init, renderCards, getDepartureHourMin, getMode };
})();
