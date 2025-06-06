// 1A) Format minutes-since-midnight into “H:MM AM/PM”
function formatTime(minutes) {
    const date = new Date(0, 0, 0, 0, minutes);
    return date.toLocaleString('en-US', { timeStyle: 'short' });
  }
  
  // 1B) Compute minutes since midnight from a Date()
  function minutesSinceMidnight(date) {
    return date.getHours() * 60 + date.getMinutes();
  }
  
  // 1C) Given raw stations + trips, roll up arrivals, departures, totalTraffic
  function computeStationTraffic(stations, trips) {
    const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
    const arrivals   = d3.rollup(trips, v => v.length, d => d.end_station_id);
  
    return stations.map(station => {
      const id = station.short_name;
      station.departures   = departures.get(id) ?? 0;
      station.arrivals     = arrivals.get(id)   ?? 0;
      station.totalTraffic = station.departures + station.arrivals;
      return station;
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
  

import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1IjoiY2hlbmFuZHJldzA2MiIsImEiOiJjbWFwdm44ZXIwMnl5Mm1vZXVmcGZyNnUxIn0.HCD9hPJDrvrc6WQtzYU8OA';

// Initialize the map
const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

map.on('load', async () => {
    // step 2 
    map.addSource('boston_route', {
        type: 'geojson',
        data: 'boston_routes.geojson',
      });

    map.addLayer({
        id: 'bike-lanes',
        type: 'line',
        source: 'boston_route',
        paint: {
          'line-color': '#32D400',
          'line-width': 3,
          'line-opacity': 0.6,
        },
    });

    map.addSource('cambridge_route', {
        type: 'geojson',
        data:
          'cambridge_routes.geojson'
    });
    map.addLayer({
        id: 'cambridge-lanes',
        type: 'line',
        source: 'cambridge_route',
        paint: {
          'line-color': '#32D400', // feel free to tweak
          'line-width': 3,
          'line-opacity': 0.6
        }
    });

    try {
        const jsonurl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';

        // Await JSON fetch
        const jsonData = await d3.json(jsonurl);

        let stations = computeStationTraffic(jsonData.data.stations, trips);

        // step 4
        // const trips = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv');
        let trips = await d3.csv(
            'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
            (trip) => {
              trip.started_at = new Date(trip.started_at);
              trip.ended_at = new Date(trip.ended_at);
              return trip;
            },
        );

        stations = stations.map((station) => {
            let id = station.short_name;
            station.arrivals = arrivals.get(id) ?? 0;
            station.departures  = departures.get(id)  ?? 0;
            station.totalTraffic = station.arrivals + station.departures;
            return station;
        });

        const radiusScale = d3.scaleSqrt()
        .domain([0, d3.max(stations, d => d.totalTraffic)])
        .range([4, 25]);   // tweak min/max radii to taste
          
        
        // step 3.3
        const svg = d3.select('#map').select('svg');

        const circles = svg
        .selectAll('circle')
        .data(stations, (d) => d.short_name) 
        .enter()
        .append('circle')
        .attr('r', d => radiusScale(d.totalTraffic)) // Radius of the circle
        .attr('fill', 'steelblue') // Circle fill color
        .attr('stroke', 'white') // Circle border color
        .attr('stroke-width', 1) // Circle border thickness
        .attr('opacity', 0.8)
        .each(function (d) {
            // Add <title> for browser tooltips
            d3.select(this)
              .append('title')
              .text(
                `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
              );
          }); // Circle opacity

        
        function updatePositions() {
            circles
              .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
              .attr('cy', (d) => getCoords(d).cy); // Set the y-position using projected coordinates
          }
          
        // Initial position update when map loads
        updatePositions();
        map.on('move', updatePositions); // Update during map movement
        map.on('zoom', updatePositions); // Update during zooming
        map.on('resize', updatePositions); // Update on window resize
        map.on('moveend', updatePositions); // Final adjustment after movement ends
        
        const timeSlider = document.getElementById('#time-slider');
        const selectedTime = document.getElementById('#selected-time');
        const anyTimeLabel = document.getElementById('#any-time');

        timeSlider.addEventListener('input', updateTimeDisplay);
        updateTimeDisplay();

        function updateScatterPlot(timeFilter) {
            // Get only the trips that match the selected time filter
            const filteredTrips = filterTripsbyTime(trips, timeFilter);
          
            timeFilter === -1 ? radiusScale.range([0, 25]) : radiusScale.range([3, 50]);
            const filteredStations = computeStationTraffic(stations, filteredTrips);
          
            // Update the scatterplot by adjusting the radius of circles
            circles
              .data(filteredStations, (d) => d.short_name) // Bind the filtered data
              .join('circle') // Ensure the data is bound correctly
              .attr('r', (d) => radiusScale(d.totalTraffic)); // Update circle sizes
          }

    } catch (error) {
        console.error('Error loading JSON:', error); // Handle errors
    }

});

function getCoords(station) {
    const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
    const { x, y } = map.project(point); // Project to pixel coordinates
    return { cx: x, cy: y }; // Return as object for use in SVG attributes
  }

function updateTimeDisplay() {
    let timeFilter = Number(timeSlider.value); // Get slider value
  
    if (timeFilter === -1) {
      selectedTime.textContent = ''; // Clear time display
      anyTimeLabel.style.display = 'block'; // Show "(any time)"
    } else {
      selectedTime.textContent = formatTime(timeFilter); // Display formatted time
      anyTimeLabel.style.display = 'none'; // Hide "(any time)"
    }
    // Call updateScatterPlot to reflect the changes on the map
    updateScatterPlot(timeFilter);
  }
