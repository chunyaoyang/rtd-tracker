// ==========================================
// RTD TRACKER LOGIC
// ==========================================

// --- CONFIGURATION ---
const SHEET_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQg1C0sxY1eudm9ykzVansI4yowTWV3-IDo6eJBEQJ8T-sf_wXXlvzhkSbwlQsQ-IdIOWSIEwA3V8o-/pub?gid=0&single=true&output=csv";

// --- STATE ---
let myTrackers = JSON.parse(localStorage.getItem('myTrackers')) || [];

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
// 1. ACTIVITY CHECKER (The "Ghost Trail" Reader)
// ==========================================

async function checkRouteActivity() {
    // Define Aliases
    const ROUTE_ALIASES = {
        'R': ['107R', 'R'],
    };

    try {
        const res = await fetch(SHEET_URL);
        const text = await res.text();
        
        // Parse CSV
        const rows = text.split('\n').slice(1).map(row => {
            const cols = row.split(',');
            if (cols.length < 2) return null;
            
            return {
                timestamp: parseInt(cols[0]), 
                routeId: cols[1] ? cols[1].trim() : '', 
                vehicleId: cols[2]
            };
        }).filter(r => r !== null && !isNaN(r.timestamp));

        // Update each tracker card
        myTrackers.forEach(tracker => {
            const dot = document.querySelector(`#card-${tracker.id} .status-dot`);
            const statusText = document.querySelector(`#card-${tracker.id} .status-text`);
            
            if (!dot || !statusText) return;

            const relevantLogs = rows.filter(log => {
                const targetID = tracker.route;
                const logID = log.routeId;

                if (logID === targetID) return true;
                if (ROUTE_ALIASES[targetID] && ROUTE_ALIASES[targetID].includes(logID)) {
                    return true;
                }
                return false;
            });

            if (relevantLogs.length > 0) {
                relevantLogs.sort((a, b) => b.timestamp - a.timestamp);
                const lastLogTime = relevantLogs[0].timestamp;
                
                const diffMs = Date.now() - lastLogTime;
                const minutesAgo = Math.floor(diffMs / 60000);

                if (minutesAgo <= 5) {
                    dot.style.background = '#2e7d32'; // Green
                    statusText.innerHTML = `Active (Log ${minutesAgo < 1 ? 'just now' : minutesAgo + 'm ago'})`;
                    statusText.style.color = '#2e7d32';
                } else {
                    dot.style.background = '#d32f2f'; // Red
                    statusText.innerHTML = `Stalled / No Signal (Last log ${minutesAgo}m ago)`;
                    statusText.style.color = '#d32f2f';
                }
            } else {
                dot.style.background = '#bdbdbd'; // Grey
                statusText.innerHTML = `No Recent Data`;
                statusText.style.color = '#999';
            }
        });

    } catch (err) {
        console.error("Error checking activity:", err);
    }
}

// ==========================================
// 2. UI & CARDS
// ==========================================

function renderTrackerCards() {
    const container = document.getElementById('tracker-container');
    container.innerHTML = '';

    if (myTrackers.length === 0) {
        container.innerHTML = '<p style="text-align:center; color:#999; margin-top:20px;">No trips tracked yet.<br>Click "+" to add one.</p>';
        return;
    }

    myTrackers.forEach(tracker => {
        const div = document.createElement('div');
        div.className = `tracker-card route-${tracker.route}`;
        div.id = `card-${tracker.id}`;
        
        div.innerHTML = `
            <button class="delete-btn" 
                type="button"
                onclick="removeTracker(${tracker.id})" 
                ontouchend="removeTracker(${tracker.id})"
                style="background:none; border:none; padding:0; cursor:pointer; touch-action: manipulation;">
                &times;
            </button>

            <div class="card-header">${tracker.stopName}</div>
            
            <div class="card-sub">Route ${tracker.route} &bull; ${tracker.direction}</div>
            
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
    const ROUTE_ALIASES = {
        'R': ['107R', 'R']
    };

    myTrackers.forEach(async (tracker) => {
        try {
            const res = await fetch(`/api/predictions?stopId=${tracker.stopId}`);
            const arrivals = await res.json();
            
            const cardText = document.querySelector(`#card-${tracker.id} .prediction-text`);
            if (!cardText) return;

            const relevantArrivals = arrivals.filter(a => {
                const busID = a.routeId.toString();
                const targetID = tracker.route;

                if (busID === targetID) return true;
                if (ROUTE_ALIASES[targetID] && ROUTE_ALIASES[targetID].includes(busID)) {
                    return true;
                }
                return false;
            });

            if (relevantArrivals.length > 0) {
                const nextBus = relevantArrivals[0];
                const color = nextBus.minutes <= 5 ? '#d32f2f' : '#2e7d32';
                
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
// 4. MODAL LOGIC (Dropdowns & Add)
// ==========================================

function openModal() { document.getElementById('modal-overlay').classList.remove('hidden'); }
function closeModal() { document.getElementById('modal-overlay').classList.add('hidden'); }

function populateDirections() {
    const route = document.getElementById('route-select').value;
    const dirSelect = document.getElementById('direction-select');
    const stopSelect = document.getElementById('stop-select');

    // Reset downstream
    dirSelect.innerHTML = '<option value="">-- Select Direction --</option>';
    stopSelect.innerHTML = '<option value="">-- Select Stop --</option>';
    dirSelect.disabled = true;
    stopSelect.disabled = true;

    if (route && typeof RTD_STOPS !== 'undefined' && RTD_STOPS[route]) {
        const allStops = RTD_STOPS[route];
        // Get unique directions
        const uniqueDirs = [...new Set(allStops.map(stop => stop.dir))];

        uniqueDirs.forEach(dir => {
            const opt = document.createElement('option');
            opt.value = dir;
            opt.text = dir;
            dirSelect.appendChild(opt);
        });
        dirSelect.disabled = false;
    }
}

function populateStops() {
    const route = document.getElementById('route-select').value;
    const direction = document.getElementById('direction-select').value;
    const stopSelect = document.getElementById('stop-select');

    // Reset Stop dropdown
    stopSelect.innerHTML = '<option value="">-- Select Stop --</option>';
    stopSelect.disabled = true;

    if (route && direction && RTD_STOPS[route]) {
        const filteredStops = RTD_STOPS[route].filter(stop => stop.dir === direction);

        filteredStops.forEach(stop => {
            const opt = document.createElement('option');
            opt.value = stop.id;
            opt.text = stop.name; 
            stopSelect.appendChild(opt);
        });
        stopSelect.disabled = false;
    }
}

function addTracker() {
    const route = document.getElementById('route-select').value;
    const direction = document.getElementById('direction-select').value;
    const stopId = document.getElementById('stop-select').value;

    if (!route || !direction || !stopId) {
        alert("Please select a Route, Direction, and Stop.");
        return;
    }

    // Find the stop name
    let stopName = "Unknown Stop";
    const foundStop = RTD_STOPS[route].find(s => s.id === stopId);
    if (foundStop) {
        stopName = foundStop.name;
    }

    const newTracker = {
        id: Date.now(),
        route: route,
        stopId: stopId,
        stopName: stopName,
        direction: direction 
    };

    myTrackers.push(newTracker);
    saveAndRender(); 
    closeModal();
}

function removeTracker(id) {
    // Note: Some mobile browsers block 'confirm', but the button logic handles the tap event.
    if(confirm("Stop tracking this trip?")) {
        myTrackers = myTrackers.filter(t => t.id !== id);
        saveAndRender();
    }
}

function saveAndRender() {
    localStorage.setItem('myTrackers', JSON.stringify(myTrackers));
    renderTrackerCards();
}