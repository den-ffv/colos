import { Router } from 'express';
import { env } from '@/config/config';

export const routeRouter: Router = Router();

// GET /api/route?from=50.45,30.52&to=49.84,24.03&provider=osrm|mapbox&profile=driving
routeRouter.get('/', async (req, res, next) => {
  try {
    const { from, to, provider = 'osrm', profile = 'driving' } = req.query as Record<string, string>;
    if (!from || !to) return res.status(400).json({ message: 'from/to required as "lat,lon"' });
    const [fromLat, fromLon] = from.split(',').map(Number);
    const [toLat, toLon] = to.split(',').map(Number);
    const coordsLonLat = `${fromLon},${fromLat};${toLon},${toLat}`;

    let url = '';
    if (provider === 'mapbox') {
      if (!env.MAPBOX_TOKEN) return res.status(500).json({ message: 'MAPBOX_TOKEN missing' });
      url = `https://api.mapbox.com/directions/v5/mapbox/${profile}/${coordsLonLat}` + `?geometries=geojson&overview=full&alternatives=false&access_token=${env.MAPBOX_TOKEN}`;
    } else {
      const base = env.OSRM_URL || 'http://localhost:5000';
      url = `${base}/route/v1/${profile}/${coordsLonLat}?geometries=geojson&overview=full&alternatives=false`;
    }

    const r = await fetch(encodeURI(url));
    if (!r.ok) return res.status(502).json({ message: `Routing upstream error: ${r.status}` });
    const json: any = await r.json();
    const route = json?.routes?.[0];
    if (!route) return res.status(404).json({ message: 'No route found' });

    const distance_km = Number((route.distance / 1000).toFixed(2));
    const duration_min = Math.round(route.duration / 60);
    res.json({ distance_km, duration_min, geometry: route.geometry, provider, profile });
  } catch (e) {
    next(e);
  }
});
