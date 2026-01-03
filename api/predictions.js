// api/predictions.js
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import axios from 'axios';

export default async function handler(req, res) {
  // Get the Stop ID from the URL (e.g. /api/predictions?stopId=34233)
  const targetStopId = req.query.stopId; 

  if (!targetStopId) {
    return res.status(400).json({ error: 'Stop ID is required' });
  }

  try {
    const response = await axios.get('https://open-data.rtd-denver.com/files/gtfs-rt/rtd/TripUpdate.pb', {
      responseType: 'arraybuffer'
    });

    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(response.data)
    );

    const arrivals = [];

    feed.entity.forEach(entity => {
      if (entity.tripUpdate && entity.tripUpdate.stopTimeUpdate) {
        
        // Check every stop in this trip's sequence
        const match = entity.tripUpdate.stopTimeUpdate.find(update => 
          update.stopId === targetStopId
        );

        if (match && match.arrival) {
          // RTD uses POSIX time (seconds since 1970). Convert to milliseconds.
          const arrivalTime = new Date(match.arrival.time * 1000);
          const now = new Date();
          
          // Only show future buses
          if (arrivalTime > now) {
            // Calculate minutes until arrival
            const diffMs = arrivalTime - now;
            const minutes = Math.round(diffMs / 60000);

            arrivals.push({
              routeId: entity.tripUpdate.trip.routeId,
              minutes: minutes,
              time: arrivalTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
            });
          }
        }
      }
    });

    // Sort by soonest arrival
    arrivals.sort((a, b) => a.minutes - b.minutes);

    // Return the top 3 arrivals
    res.status(200).json(arrivals.slice(0, 3));
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch prediction data' });
  }
}