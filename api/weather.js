export default async function handler(req, res) {
  const { lat, lng } = req.query;
  if (!lat || !lng || isNaN(parseFloat(lat)) || isNaN(parseFloat(lng))) {
    return res.status(400).json({ error: 'Invalid coordinates. Expected: lat, lng' });
  }

  // Round to 2 decimals (~1km grid) for cache key normalization
  const rlat = parseFloat(lat).toFixed(2);
  const rlng = parseFloat(lng).toFixed(2);

  const url = `https://api.open-meteo.com/v1/forecast?latitude=${rlat}&longitude=${rlng}&hourly=cloud_cover&forecast_days=7&timezone=auto`;

  const upstream = await fetch(url);

  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: 'Open-Meteo error: ' + upstream.status });
  }

  const data = await upstream.json();
  res.setHeader('Cache-Control', 's-maxage=1800, stale-while-revalidate=3600');
  res.setHeader('Access-Control-Allow-Origin', '*');
  return res.status(200).json(data);
}
