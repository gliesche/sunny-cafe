export default async function handler(req, res) {
  const bbox = req.query.bbox;
  if (!bbox || bbox.split(',').length !== 4 || bbox.split(',').some(n => isNaN(parseFloat(n)))) {
    return res.status(400).json({ error: 'Invalid bbox. Expected: south,west,north,east' });
  }

  const query = `
    [out:json][timeout:30];
    (
      node["amenity"="cafe"]["outdoor_seating"](${bbox});
      way["amenity"="cafe"]["outdoor_seating"](${bbox});
    )->.cafes;
    .cafes out center body;
    way["highway"~"^(residential|tertiary|secondary|primary|pedestrian|living_street|unclassified)$"](around.cafes:80)->.streets;
    .streets out geom;
  `;

  const upstream = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
  });

  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: 'Overpass error: ' + upstream.status });
  }

  const data = await upstream.json();
  res.setHeader('Cache-Control', 's-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json(data);
}
