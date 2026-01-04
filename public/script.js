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
// 4. ACTIVITY CHECKER (The "Ghost Trail" Reader)
// ==========================================

async function checkRouteActivity() {
    // 1. Define Aliases (Must match your Prediction logic)
    const ROUTE_ALIASES = {
        'R': ['107R', 'R'],
        // Add others if needed
    };

    try {
        // Fetch the CSV from Google Sheets
        // (Ensure const SHEET_URL = "..." is defined at the top of your file)
        const res = await fetch(SHEET_URL);
        const text = await res.text();
        
        // 2. Parse CSV: Handle Raw Timestamp & Routes
        const rows = text.split('\n').slice(1).map(row => {
            const cols = row.split(',');
            if (cols.length < 2) return null;
            
            return {
                // Column 0 is now a raw number (e.g. 1704234000000)
                timestamp: parseInt(cols[0]), 
                routeId: cols[1] ? cols[1].trim() : '', 
                vehicleId: cols[2]
            };
        }).filter(r => r !== null && !isNaN(r.timestamp));

        // 3. Update each tracker card
        myTrackers.forEach(tracker => {
            const dot = document.querySelector(`#card-${tracker.id} .status-dot`);
            const statusText = document.querySelector(`#card-${tracker.id} .status-text`);
            
            if (!dot || !statusText) return;

            // Filter logs for this specific route (checking Aliases)
            const relevantLogs = rows.filter(log => {
                const targetID = tracker.route; // e.g. "R"
                const logID = log.routeId;      // e.g. "107R"

                // Strict Match
                if (logID === targetID) return true;
                
                // Alias Match
                if (ROUTE_ALIASES[targetID] && ROUTE_ALIASES[targetID].includes(logID)) {
                    return true;
                }
                return false;
            });

            // 4. Determine Status based on time
            if (relevantLogs.length > 0) {
                // Find the newest log
                relevantLogs.sort((a, b) => b.timestamp - a.timestamp);
                const lastLogTime = relevantLogs[0].timestamp;
                
                // Calculate difference in minutes
                // Date.now() is your computer's time vs the sheet's recorded time
                const diffMs = Date.now() - lastLogTime;
                const minutesAgo = Math.floor(diffMs / 60000);

                // If data is fresh (less than 5 mins old) -> Active
                if (minutesAgo <= 5) {
                    dot.style.background = '#2e7d32'; // Green
                    statusText.innerHTML = `Active (Log ${minutesAgo < 1 ? 'just now' : minutesAgo + 'm ago'})`;
                    statusText.style.color = '#2e7d32';
                } else {
                    // Data exists, but it's old -> Stalled
                    dot.style.background = '#d32f2f'; // Red
                    statusText.innerHTML = `Stalled / No Signal (Last log ${minutesAgo}m ago)`;
                    statusText.style.color = '#d32f2f';
                }
            } else {
                // No logs found for this route at all
                dot.style.background = '#bdbdbd'; // Grey
                statusText.innerHTML = `No Recent Data`;
                statusText.style.color = '#999';
            }
        });

    } catch (err) {
        console.error("Error checking activity:", err);
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
                
                // CHANGE: Only showing the minutes, removing the (Time - Route) text
                cardText.innerHTML = `
                    <span style="color:${color}">${nextBus.minutes} min</span> 
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
    const routeSelect = document.getElementById('route-select');
    const stopSelect = document.getElementById('stop-select');
    const dirSelect = document.getElementById('direction-select');

    const route = routeSelect.value;
    const stopId = stopSelect.value;
    const direction = dirSelect.value;

    if (!route || !stopId) {
        alert("Please select a Route and a Stop.");
        return;
    }

    // --- FIX: Look up the Stop Name ---
    let stopName = "Unknown Stop";
    if (typeof RTD_STOPS !== 'undefined' && RTD_STOPS[route]) {
        // Find the stop object that matches the selected ID
        const foundStop = RTD_STOPS[route].find(s => s.id === stopId);
        if (foundStop) {
            stopName = foundStop.name; // e.g. "Peoria St & 17th Ave"
        }
    }
    // ----------------------------------

    const newTracker = {
        id: Date.now(),
        route: route,
        stopId: stopId,
        stopName: stopName, // <--- Saving the name here!
        direction: direction 
    };

    myTrackers.push(newTracker);
    
    // Save and Refresh
    // Note: Ensure your render function names match (renderTrackerCards vs renderTrackers)
    localStorage.setItem('myTrackers', JSON.stringify(myTrackers));
    closeModal();
    renderTrackerCards(); 
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