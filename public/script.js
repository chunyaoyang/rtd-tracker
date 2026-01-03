// public/script.js

// --- CONFIGURATION ---
const TARGET_ROUTES = ['A', 'R', '121']; 
const MAX_HISTORY_POINTS = 40;

// !!! PASTE YOUR GOOGLE SHEET CSV LINK HERE !!!
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQg1C0sxY1eudm9ykzVansI4yowTWV3-IDo6eJBEQJ8T-sf_wXXlvzhkSbwlQsQ-IdIOWSIEwA3V8o-/pub?gid=0&single=true&output=csv"; 

// --- STATE ---
const vehicleHistory = {}; 
const markers = {};        
const polylines = {};      

// --- MAP SETUP ---
// We initialize the map globally so other functions can reach it
let map;

function initMap() {
    // 1. Initialize Map
    map = L.map('map').setView([39.7392, -104.9903], 11);

    // 2. Add "CartoDB Positron" (Light Monotone) Tiles
    // This map is designed specifically for data visualization (clean, grey, minimal)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);
}

// --- HISTORY LOGIC ---
async function loadHistoryFromSheet() {
    console.log("Downloading history from Google Sheet...");
    try {
        const res = await fetch(SHEET_URL);
        const text = await res.text();
        
        const rows = text.split('\n').slice(1); // Remove header
        
        rows.forEach(row => {
            const cols = row.split(',');
            if (cols.length < 6) return; 

            // Columns: 0=Time, 1=Route, 2=ID, 3=Dir, 4=Lat, 5=Lng
            const id = cols[2];
            const lat = parseFloat(cols[4]);
            const lng = parseFloat(cols[5]);

            if (!vehicleHistory[id]) vehicleHistory[id] = [];
            
            // Sheet data is usually chronological, so we push to the end
            vehicleHistory[id].push([lat, lng]);
        });

        console.log("History loaded. Drawing trails...");
        drawTrails();

    } catch (err) {
        console.error("Could not load Sheet history:", err);
    }
}

function drawTrails() {
    Object.keys(vehicleHistory).forEach(id => {
        if (!polylines[id]) {
            polylines[id] = L.polyline(vehicleHistory[id], {
                color: 'blue',
                weight: 3,
                opacity: 0.5,
                dashArray: '5, 5'
            }).addTo(map);
        } else {
            polylines[id].setLatLngs(vehicleHistory[id]);
        }
    });
}

// --- LIVE UPDATE LOGIC ---
async function updateMap() {
    try {
        const response = await fetch('/api/vehicles');
        const allData = await response.json();
        
        const activeVehicles = allData.filter(v => TARGET_ROUTES.includes(v.routeId));
        
        // Safety check: Ensure the element exists before updating text
        const countEl = document.getElementById('vehicle-count');
        if (countEl) countEl.innerText = `${activeVehicles.length} vehicles active`;

        activeVehicles.forEach(bus => {
            const id = bus.id;
            const lat = bus.lat;
            const lng = bus.lng;

            // 1. Add to History
            if (!vehicleHistory[id]) vehicleHistory[id] = [];
            vehicleHistory[id].push([lat, lng]);
            
            if (vehicleHistory[id].length > MAX_HISTORY_POINTS) vehicleHistory[id].shift();

            // 2. Update Marker
            if (!markers[id]) {
                const iconHtml = `<div class="bus-icon">${bus.routeId}</div>`;
                const icon = L.divIcon({ className: 'custom-div-icon', html: iconHtml, iconSize: [30, 30] });
                markers[id] = L.marker([lat, lng], {icon: icon}).addTo(map);
                markers[id].bindPopup(`<strong>${bus.routeId}</strong> #${id}`);
            } else {
                markers[id].setLatLng([lat, lng]);
            }
        });

        drawTrails();

    } catch (err) { console.error(err); }
}

// --- STARTUP ---
// This event listener waits for the HTML to be ready
document.addEventListener('DOMContentLoaded', () => {
    initMap();
    
    // Load history first, then start live updates
    loadHistoryFromSheet().then(() => {
        updateMap();
        setInterval(updateMap, 15000);
    });
});