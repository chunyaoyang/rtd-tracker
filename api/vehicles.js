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

// api/vehicles.js

    const vehicles = feed.entity.map(entity => {
      if (!entity.vehicle) return null;

      // ... (Keep your Route ID normalization logic here) ...
      let routeID = entity.vehicle.trip.routeId;

      if (routeID === '107' || routeID === '107R') routeID = 'R'; 

      const realBusNumber = entity.vehicle.vehicle?.label || entity.id;

      return {
        id: realBusNumber,
        routeId: routeID,
        directionId: entity.vehicle.trip.directionId ?? "?",
        lat: entity.vehicle.position.latitude,
        lng: entity.vehicle.position.longitude,
        // NEW: Get the compass bearing (0-360 degrees)
        bearing: entity.vehicle.position.bearing || 0, 
        timestamp: entity.vehicle.timestamp
      };
    }).filter(v => v !== null);

    res.status(200).json(vehicles);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch RTD data' });
  }
}