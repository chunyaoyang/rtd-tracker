// --- CONFIGURATION ---
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQg1C0sxY1eudm9ykzVansI4yowTWV3-IDo6eJBEQJ8T-sf_wXXlvzhkSbwlQsQ-IdIOWSIEwA3V8o-/pub?gid=0&single=true&output=csv";

// --- STATE ---
let myTrackers = JSON.parse(localStorage.getItem('myTrackers')) || [];
let routeStatus = {}; // Stores last seen time for each route: { "A": timestamp, "R": timestamp }

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    renderTrackerCards(); 
    refreshAllData(); // Initial load

    // Update everything every 30 seconds
    setInterval(refreshAllData, 30000); 
});

async function refreshAllData() {
    await checkRouteActivity(); // 1. Check spreadsheet for movement
    updateAllPredictions();     // 2. Check API for arrival times
}

// ==========================================
// 1. SPREADSHEET STATUS CHECK (The "Heartbeat")
// ==========================================
async function checkRouteActivity() {
    try {
        const res = await fetch(SHEET_URL);
        const text = await res.text();
        const rows = text.split('\n').slice(1); // Skip header

        // Reset status
        routeStatus = {}; 

        // Scan rows to find the LATEST timestamp for each route
        rows.forEach(row => {
            const cols = row.split(',');
            if (cols.length < 2) return;
            
            // CSV Format: Time (0), Route (1), ID (2)...
            const timestamp = new Date(cols[0]).getTime();
            const routeId = cols[1];

            // If this row is newer than what we have stored, update it
            if (!routeStatus[routeId] || timestamp > routeStatus[routeId]) {
                routeStatus[routeId] = timestamp;
            }
        });

        // Update the UI indicators immediately after checking
        updateStatusIndicators();

    } catch (err) {
        console.error("Failed to load spreadsheet status:", err);
    }
}

function updateStatusIndicators() {
    const now = Date.now();

    myTrackers.forEach(tracker => {
        const lastSeen = routeStatus[tracker.route];
        const statusTextEl = document.querySelector(`#card-${tracker.id} .status-text`);
        const statusDotEl = document.querySelector(`#card-${tracker.id} .status-dot`);
        
        if (!statusTextEl || !statusDotEl) return;

        if (lastSeen) {
            const diffMinutes = Math.floor((now - lastSeen) / 60000);

            if (diffMinutes <= 10) {
                // Active recently (Green)
                statusDotEl.className = "status-dot active";
                statusTextEl.innerText = `System Active (Last log ${diffMinutes}m ago)`;
                statusTextEl.style.color = "#2e7d32";
            } else {
                // No logs for > 10 mins (Red)
                statusDotEl.className = "status-dot inactive";
                statusTextEl.innerText = `Stalled / No Data (Last log ${diffMinutes}m ago)`;
                statusTextEl.style.color = "#d32f2f";
            }
        } else {
            statusTextEl.innerText = "Status Unknown";
        }
    });
}

// ==========================================
// 2. UI & CARDS
// ==========================================

function renderTrackerCards() {
    const container = document.getElementById('tracker-container');
    container.innerHTML = '';

    if (myTrackers.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999;">No trips tracked yet. Click "+" to add one.</p>';
        return;
    }

    myTrackers.forEach(tracker => {
        const div = document.createElement('div');
        div.className = `tracker-card route-${tracker.route}`;
        div.id = `card-${tracker.id}`;
        
        div.innerHTML = `
            <div class="delete-btn" onclick="removeTracker(${tracker.id})">&times;</div>
            <div class="card-header">${tracker.stopName}</div>
            <div class="card-sub">Route ${tracker.route} &bull; ${tracker.dir}</div>
            
            <div class="prediction-text">
                Loading...
            </div>

            <div class="status-indicator">
                <span class="status-dot"></span>
                <span class="status-text">Checking system...</span>
            </div>
        `;
        container.appendChild(div);
    });
}

// ==========================================
// 3. PREDICTION API (Next Arrival)
// ==========================================

// ==========================================
// 3. PREDICTION API (Next Arrival)
// ==========================================

async function updateAllPredictions() {
    // Define known aliases for routes that have weird IDs (like R Line)
    const ROUTE_ALIASES = {
        'R': ['107R', 'R'],
        // Add others here if discovered later
    };

    myTrackers.forEach(async (tracker) => {
        try {
            const res = await fetch(`/api/predictions?stopId=${tracker.stopId}`);
            const arrivals = await res.json();
            
            const cardText = document.querySelector(`#card-${tracker.id} .prediction-text`);
            if (!cardText) return;

            // Strict Filter: Only keep buses that match the ID OR the Alias List
            const relevantArrivals = arrivals.filter(a => {
                const busID = a.routeId.toString();
                const targetID = tracker.route;

                // 1. Exact Match? (e.g. "121" === "121")
                if (busID === targetID) return true;

                // 2. Alias Match? (e.g. Is "107R" in the list for "R"?)
                if (ROUTE_ALIASES[targetID] && ROUTE_ALIASES[targetID].includes(busID)) {
                    return true;
                }

                return false;
            });

            if (relevantArrivals.length > 0) {
                const nextBus = relevantArrivals[0];
                const color = nextBus.minutes <= 5 ? '#d32f2f' : '#2e7d32';
                
                // We still show the Route ID in small text just in case
                cardText.innerHTML = `
                    <span style="color:${color}">${nextBus.minutes} min</span> 
                    <span style="font-size:0.6em; color:#999; font-weight:normal;">
                        (${nextBus.time} - Route ${nextBus.routeId})
                    </span>
                `;
            } else {
                cardText.innerHTML = `<span style="font-size:0.8em; color:#999; font-weight:normal;">No upcoming arrivals</span>`;
            }
        } catch (err) {
            console.error("Error updating card", tracker.id, err);
        }
    });
}

// ==========================================
// 4. MODAL LOGIC (Add/Remove)
// ==========================================

function openModal() { document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

function populateStops() {
    const route = document.getElementById('route-select').value;
    const stopSelect = document.getElementById('stop-select');
    stopSelect.innerHTML = '<option value="">-- Choose Stop --</option>';
    stopSelect.disabled = true;

    if (route && typeof RTD_STOPS !== 'undefined' && RTD_STOPS[route]) {
        stopSelect.disabled = false;
        RTD_STOPS[route].forEach(stop => {
            const opt = document.createElement('option');
            opt.value = stop.id;
            opt.text = `${stop.name} (${stop.dir})`;
            stopSelect.appendChild(opt);
        });
    }
}

function addTracker() {
    const route = document.getElementById('route-select').value;
    const stopId = document.getElementById('stop-select').value;
    
    if (!route || !stopId) return alert("Please select both a route and a stop.");

    const stopObj = RTD_STOPS[route].find(s => s.id === stopId);

    myTrackers.push({
        id: Date.now(),
        route: route,
        stopId: stopId,
        stopName: stopObj.name,
        dir: stopObj.dir
    });

    saveAndRender();
    closeModal();
    refreshAllData(); 
}

function removeTracker(id) {
    if(confirm("Stop tracking this trip?")) {
        myTrackers = myTrackers.filter(t => t.id !== id);
        saveAndRender();
    }
}

function saveAndRender() {
    localStorage.setItem('myTrackers', JSON.stringify(myTrackers));
    renderTrackerCards();
}