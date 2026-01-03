// api/vehicles.js
import GtfsRealtimeBindings from 'gtfs-realtime-bindings';
import axios from 'axios';

export default async function handler(req, res) {
  try {
    // 1. Download the binary data from RTD
    const response = await axios.get('https://open-data.rtd-denver.com/files/gtfs-rt/rtd/VehiclePosition.pb', {
      responseType: 'arraybuffer'
    });

    // 2. Decode the Protocol Buffer
    const feed = GtfsRealtimeBindings.transit_realtime.FeedMessage.decode(
      new Uint8Array(response.data)
    );

// 3. Convert to simple JSON
    const vehicles = feed.entity.map(entity => {
      if (!entity.vehicle) return null;

      // FIX: Use the Label (bus number)
      const realBusNumber = entity.vehicle.vehicle?.label || entity.id;

      return {
        id: realBusNumber,
        routeId: entity.vehicle.trip.routeId,
        // NEW: Add direction ID (defaults to "Unknown" if missing)
        directionId: entity.vehicle.trip.directionId ?? "?", 
        lat: entity.vehicle.position.latitude,
        lng: entity.vehicle.position.longitude,
        timestamp: entity.vehicle.timestamp
      };
    }).filter(v => v !== null);

    // 4. Send JSON to the frontend
    res.status(200).json(vehicles);
    
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch RTD data' });
  }
}