// ==========================================
// RTD TRACKER LOGIC (Clean Version)
// ==========================================

// --- STATE ---
let myTrackers = JSON.parse(localStorage.getItem('myTrackers')) || [];

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
    renderTrackerCards(); 
    refreshAllData(); // Initial load

    // Update prediction times every 30 seconds
    setInterval(refreshAllData, 30000); 
});

function refreshAllData() {
    updateAllPredictions(); // Only check the API now
}

// ==========================================
// 1. UI & CARDS
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
        
        // REMOVED: The Status Indicator (Green/Red Dot) section
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
        `;
        container.appendChild(div);
    });
}

// ==========================================
// 2. PREDICTION API (Next Arrival)
// ==========================================

async function updateAllPredictions() {
    // Define aliases for route matching
    const ROUTE_ALIASES = {
        'R': ['107R', 'R'],
        'A': ['A', '37A']
    };

    myTrackers.forEach(async (tracker) => {
        try {
            // Note: This fetch assumes you have a backend/Vercel function at /api/predictions
            const res = await fetch(`/api/predictions?stopId=${tracker.stopId}`);
            const arrivals = await res.json();
            
            const cardText = document.querySelector(`#card-${tracker.id} .prediction-text`);
            if (!cardText) return;

            // Filter to find buses/trains matching our route
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
                // Simple Color Logic: Red if <= 5 mins, Green if > 5 mins
                const color = nextBus.minutes <= 5 ? '#d32f2f' : '#2e7d32';
                
                cardText.innerHTML = `
                    <span style="color:${color}">${nextBus.minutes} min</span> 
                `;
            } else {
                cardText.innerHTML = `<span style="font-size:0.8em; color:#999; font-weight:normal;">No upcoming arrivals</span>`;
            }
        } catch (err) {
            console.error("Error updating card", tracker.id, err);
            // Optional: Show error state in card
            const cardText = document.querySelector(`#card-${tracker.id} .prediction-text`);
            if (cardText) cardText.innerHTML = "..."; 
        }
    });
}

// ==========================================
// 3. MODAL LOGIC (Dropdowns & Add)
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
    if(confirm("Stop tracking this trip?")) {
        myTrackers = myTrackers.filter(t => t.id !== id);
        saveAndRender();
    }
}

function saveAndRender() {
    localStorage.setItem('myTrackers', JSON.stringify(myTrackers));
    renderTrackerCards();
}
