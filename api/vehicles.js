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
      return {
        id: entity.id,
        routeId: entity.vehicle.trip.routeId,
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