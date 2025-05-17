import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3     from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// 1A) Format minutes‐since‐midnight into “H:MM AM/PM”
function formatTime(minutes) {
  const d = new Date(0, 0, 0, 0, minutes);
  return d.toLocaleString('en-US', { timeStyle: 'short' });
}

// 1B) Compute minutes since midnight from a Date()
function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

// 1C) Given raw stations + trips, roll up departures, arrivals, totalTraffic
function computeStationTraffic(stations, trips) {
  const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
  const arrivals   = d3.rollup(trips, v => v.length, d => d.end_station_id);

  return stations.map(st => {
    const id = st.short_name;
    st.departures   = departures.get(id) ?? 0;
    st.arrivals     = arrivals.get(id)   ?? 0;
    st.totalTraffic = st.departures + st.arrivals;
    return st;
  });
}

// 1D) Filter trips to ±60 min around the slider
function filterTripsByTime(trips, timeFilter) {
  if (timeFilter === -1) return trips;
  return trips.filter(trip => {
    const startM = minutesSinceMidnight(trip.started_at);
    const endM   = minutesSinceMidnight(trip.ended_at);
    return Math.abs(startM - timeFilter) <= 60
        || Math.abs(endM   - timeFilter) <= 60;
  });
}

// ————————————————————————————————————————————————————————————
// Initialize Mapbox
mapboxgl.accessToken = 'pk.eyJ1IjoiY2hlbmFuZHJldzA2MiIsImEiOiJjbWFwdm44ZXIwMnl5Mm1vZXVmcGZyNnUxIn0.HCD9hPJDrvrc6WQtzYU8OA';
const map = new mapboxgl.Map({
  container: 'map',
  style:     'mapbox://styles/mapbox/streets-v12',
  center:    [-71.09415, 42.36027],
  zoom:      12,
  minZoom:   5,
  maxZoom:   18
});

// Helper to project lon/lat to pixel coords
function getCoords(st) {
  const pt = new mapboxgl.LngLat(+st.lon, +st.lat);
  const { x, y } = map.project(pt);
  return { cx: x, cy: y };
}

map.on('load', async () => {
  // 2) Add your static lane layers
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'boston_routes.geojson'
  });
  map.addLayer({
    id:    'boston-lanes',
    type:  'line',
    source:'boston_route',
    paint: {
      'line-color':   '#32D400',
      'line-width':   3,
      'line-opacity': 0.6
    }
  });

  map.addSource('cambridge_route', {
    type: 'geojson',
    data: 'cambridge_routes.geojson'
  });
  map.addLayer({
    id:    'cambridge-lanes',
    type:  'line',
    source:'cambridge_route',
    paint: {
      'line-color':   '#32D400',
      'line-width':   3,
      'line-opacity': 0.6
    }
  });

  try {
    // 3A) Load stations JSON & trips CSV in parallel
    const [ jsonData, trips ] = await Promise.all([
      d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json'),
      d3.csv(
        'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
        d => {
          d.started_at = new Date(d.started_at);
          d.ended_at   = new Date(d.ended_at);
          return d;
        }
      )
    ]);

    // 3B) Compute initial station traffic
    let stations = computeStationTraffic(jsonData.data.stations, trips);

    // 3C) Prepare D3 overlay & radius scale
    const radiusScale = d3.scaleSqrt()
      .domain([0, d3.max(stations, d => d.totalTraffic)])
      .range([4, 25]);

    const svg = d3.select(map.getCanvasContainer()).append('svg');
    let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

    const circles = svg.selectAll('circle')
      .data(stations, d => d.short_name)
      .enter()
      .append('circle')
        .attr('r', d => radiusScale(d.totalTraffic))
        .attr('fill', 'steelblue')
        .attr('stroke', 'white')
        .attr('stroke-width', 1)
        .attr('opacity', 0.6)
      .each(function(d) {
        d3.select(this)
          .append('title')
          .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`)
          .style('--departure-ratio', (d) => stationFlow(d.departures / d.totalTraffic))
    ;
      });

    // 3D) Position updater
    function updatePositions() {
      circles
        .attr('cx', d => getCoords(d).cx)
        .attr('cy', d => getCoords(d).cy);
    }
    updatePositions();
    ['move','zoom','resize','moveend'].forEach(evt => map.on(evt, updatePositions));

    // 3E) Wire up your slider controls
    const timeSlider   = document.getElementById('time-slider');
    const timeDisplay  = document.getElementById('time-display');
    const anyTimeLabel = document.getElementById('any-time');

    function updateScatterPlot(timeFilter) {
        const filteredTrips    = filterTripsByTime(trips, timeFilter);
        const filteredStations = computeStationTraffic(
          jsonData.data.stations,
          filteredTrips
        );
        timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
        circles
          .data(filteredStations, d => d.short_name)
          .join(
            enter => enter.append('circle'),
            update => update,
            exit   => exit.remove()
          )
          .attr('r', d => radiusScale(d.totalTraffic))
          .style('--departure-ratio', (d) =>
      stationFlow(d.departures / d.totalTraffic),
    );
    }      

    function updateTimeDisplay() {
      const tf = +timeSlider.value;
      if (tf === -1) {
        timeDisplay.textContent    = '';
        anyTimeLabel.style.display = 'block';
      } else {
        timeDisplay.textContent    = formatTime(tf);
        anyTimeLabel.style.display = 'none';
      }
      updateScatterPlot(tf);
    }

    timeSlider.addEventListener('input', updateTimeDisplay);
    updateTimeDisplay();  // trigger initial render

  } catch (err) {
    console.error('Error loading or rendering data:', err);
  }
});
