// api/vehicles.js
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import axios from 'axios';

export default async function handler(req, res) {
  try {
    const response = await axios.get('https://open-data.rtd-denver.com/files/gtfs-rt/rtd/VehiclePosition.pb', {
      responseType: 'arraybuffer'
    });

    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(response.data)
    );

    const vehicles = feed.entity.map(entity => {
      if (!entity.vehicle) return null;

      let routeID = entity.vehicle.trip.routeId;

      // --- FIX: Normalize the strange RTD IDs ---
      // We check for both the number (101) and the letter-combo (101A) just to be safe.
      

      if (routeID === '107' || routeID === '107R') routeID = 'R'; 


      // Get real bus number or fall back to ID
      const realBusNumber = entity.vehicle.vehicle?.label || entity.id;

      return {
        id: realBusNumber,
        routeId: routeID, // This will now be "R" instead of "107R"
        directionId: entity.vehicle.trip.directionId ?? "?",
        lat: entity.vehicle.position.latitude,
        lng: entity.vehicle.position.longitude,
        timestamp: entity.vehicle.timestamp
      };
    }).filter(v => v !== null);

    res.status(200).json(vehicles);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch RTD data' });
  }
}