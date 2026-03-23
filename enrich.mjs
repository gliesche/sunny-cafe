/**
 * Pre-Enrichment Script für Sunny Café Finder
 *
 * Lädt Café-Daten aus Overpass, reichert sie per AI SDK an
 * (Terrassen-Ausrichtung, Beschreibung, Sonnenzeiten),
 * und speichert als JSON für die HTML-App.
 *
 * Usage:
 *   ANTHROPIC_API_KEY=sk-... node enrich.mjs "Hamburg"
 *   ANTHROPIC_API_KEY=sk-... node enrich.mjs "Berlin" --force
 */

import { generateText, Output } from 'ai';
import { anthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import fs from 'fs/promises';
import path from 'path';

// ── Config ─────────────────────────────────────
const BATCH_SIZE = 12;
const OUTPUT_DIR = './data';
const MODEL = anthropic('claude-sonnet-4-5-20241022', { cacheControl: true });

// ── Schemas ────────────────────────────────────
const EnrichedCafeSchema = z.object({
  cafes: z.array(z.object({
    id: z.number().describe('OSM node/way ID'),
    terrace_direction: z.enum(['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'unknown'])
      .describe('Geschätzte Himmelsrichtung der Terrasse/Außenbereich'),
    description: z.string()
      .describe('1-2 Sätze über den Außenbereich, Atmosphäre, besondere Merkmale'),
    best_sun_period: z.enum(['morning', 'midday', 'afternoon', 'evening', 'all-day', 'unknown'])
      .describe('Wann bekommt die Terrasse am meisten Sonne?'),
    confidence: z.enum(['high', 'medium', 'low'])
      .describe('Wie sicher ist die Einschätzung? high = bekanntes Café, low = reine Schätzung'),
  }))
});

// ── Overpass API ───────────────────────────────
async function fetchCafes(city) {
  console.log(`Lade Cafés für ${city}...`);
  const query = `
    [out:json][timeout:60];
    area["name"="${city}"]["boundary"="administrative"]->.city;
    (
      node["amenity"="cafe"]["outdoor_seating"](area.city);
      way["amenity"="cafe"]["outdoor_seating"](area.city);
    );
    out center body;
  `;

  const res = await fetch('https://overpass-api.de/api/interpreter', {
    method: 'POST',
    body: 'data=' + encodeURIComponent(query),
  });

  if (!res.ok) throw new Error(`Overpass error: ${res.status}`);
  const data = await res.json();

  const cafes = data.elements
    .filter(e => e.tags && e.tags.amenity === 'cafe')
    .map(e => ({
      id: e.id,
      lat: e.lat || e.center?.lat,
      lng: e.lon || e.center?.lon,
      name: e.tags.name || 'Unbekannt',
      street: e.tags['addr:street'] || '',
      housenumber: e.tags['addr:housenumber'] || '',
      outdoor: e.tags.outdoor_seating,
      cuisine: e.tags.cuisine || '',
      hours: e.tags.opening_hours || '',
      website: e.tags.website || '',
    }))
    .filter(c => c.lat && c.lng);

  // Deduplicate
  const seen = new Set();
  return cafes.filter(c => {
    const key = c.lat.toFixed(5) + ',' + c.lng.toFixed(5);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── AI Enrichment ──────────────────────────────
async function enrichBatch(cafes, city, batchNum, totalBatches) {
  const cafeList = cafes.map(c => {
    const addr = [c.street, c.housenumber].filter(Boolean).join(' ');
    return `- ID ${c.id}: "${c.name}" ${addr ? `(${addr})` : ''} [${c.lat.toFixed(4)}, ${c.lng.toFixed(4)}]`;
  }).join('\n');

  console.log(`  Batch ${batchNum}/${totalBatches}: ${cafes.length} Cafés anreichern...`);

  const { output } = await generateText({
    model: MODEL,
    output: Output.object({ schema: EnrichedCafeSchema }),
    prompt: `Du bist ein lokaler Gastro-Experte für ${city}. Für die folgenden Cafés mit Außenbereich:

${cafeList}

Schätze für jedes Café:
1. **terrace_direction**: Wohin zeigt die Terrasse/der Außenbereich? Nutze die Straßenlage als Hinweis — wenn ein Café an einer Ost-West-Straße liegt, zeigt der Außenbereich oft nach Süden. Bei bekannten Cafés nutze dein Wissen.
2. **description**: 1-2 kurze Sätze über den Außenbereich (Atmosphäre, Besonderheiten, Stil).
3. **best_sun_period**: Wann bekommt die Terrasse am meisten Sonne? Basierend auf Ausrichtung und Umgebung.
4. **confidence**: high = du kennst das Café, medium = du kennst die Gegend gut, low = reine Schätzung aus der Adresse.

Antworte für ALLE ${cafes.length} Cafés. Sei ehrlich bei der Confidence — lieber "low" als falsche Sicherheit.`,
  });

  return output?.cafes || [];
}

// ── Main ───────────────────────────────────────
async function main() {
  const city = process.argv[2];
  const force = process.argv.includes('--force');

  if (!city) {
    console.error('Usage: ANTHROPIC_API_KEY=sk-... node enrich.mjs "Hamburg" [--force]');
    process.exit(1);
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY ist nicht gesetzt.');
    console.error('Export: export ANTHROPIC_API_KEY=sk-...');
    process.exit(1);
  }

  const outFile = path.join(OUTPUT_DIR, `${city.toLowerCase()}.json`);

  // Check if already enriched
  try {
    await fs.access(outFile);
    if (!force) {
      console.log(`${outFile} existiert bereits. Nutze --force zum Überschreiben.`);
      process.exit(0);
    }
  } catch {}

  // 1. Fetch cafés
  const cafes = await fetchCafes(city);
  console.log(`${cafes.length} Cafés mit Außenbereich gefunden.`);

  if (cafes.length === 0) {
    console.log('Keine Cafés gefunden. Überprüfe den Stadtnamen.');
    process.exit(0);
  }

  // 2. Enrich in batches
  const batches = [];
  for (let i = 0; i < cafes.length; i += BATCH_SIZE) {
    batches.push(cafes.slice(i, i + BATCH_SIZE));
  }

  const enriched = new Map();
  for (let i = 0; i < batches.length; i++) {
    try {
      const results = await enrichBatch(batches[i], city, i + 1, batches.length);
      for (const r of results) {
        enriched.set(r.id, r);
      }
    } catch (err) {
      console.error(`  Batch ${i + 1} fehlgeschlagen:`, err.message);
    }

    // Rate limit: kurze Pause zwischen Batches
    if (i < batches.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }

  console.log(`${enriched.size}/${cafes.length} Cafés erfolgreich angereichert.`);

  // 3. Merge enrichment with base data
  const result = cafes.map(cafe => {
    const ai = enriched.get(cafe.id);
    return {
      ...cafe,
      ai_direction: ai?.terrace_direction || null,
      ai_description: ai?.description || null,
      ai_sun_period: ai?.best_sun_period || null,
      ai_confidence: ai?.confidence || null,
    };
  });

  // 4. Save
  await fs.mkdir(OUTPUT_DIR, { recursive: true });
  await fs.writeFile(outFile, JSON.stringify({
    city,
    enriched_at: new Date().toISOString(),
    count: result.length,
    cafes: result,
  }, null, 2));

  console.log(`Gespeichert: ${outFile} (${result.length} Cafés)`);
}

main().catch(err => {
  console.error('Fehler:', err);
  process.exit(1);
});
