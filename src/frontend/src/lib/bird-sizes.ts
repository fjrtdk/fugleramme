/**
 * bird-sizes.ts
 *
 * Loads and caches AVONET body-mass data from /bird_sizes.csv.
 * The CSV has two columns: scientific_name,mass_g
 *
 * Provides a synchronous lookup that returns the body mass in grams,
 * or FALLBACK_MASS_G when the species is not in the dataset.
 *
 * The fallback value (22 g) is the approximate median of common
 * garden birds (house sparrow 28 g, chaffinch 24 g, robin 17 g,
 * blue tit 11 g, great tit 18 g, dunnock 21 g).
 */

export const FALLBACK_MASS_G = 22;

type MassMap = Map<string, number>;

let massCache: MassMap | null = null;
let loadPromise: Promise<MassMap> | null = null;

async function loadMassMap(): Promise<MassMap> {
  if (massCache) return massCache;
  if (loadPromise) return loadPromise;

  loadPromise = fetch('/bird_sizes.csv')
    .then(r => r.text())
    .then(text => {
      const map: MassMap = new Map();
      const lines = text.split('\n');
      // Skip header row (scientific_name,mass_g)
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i]!.trim();
        if (!line) continue;
        const comma = line.indexOf(',');
        if (comma < 0) continue;
        const name = line.slice(0, comma).trim();
        const mass = parseFloat(line.slice(comma + 1).trim());
        if (name && isFinite(mass) && mass > 0) {
          map.set(name, mass);
        }
      }
      massCache = map;
      return map;
    })
    .catch(() => {
      massCache = new Map();
      return massCache;
    });

  return loadPromise;
}

// Pre-load as soon as this module is imported.
loadMassMap();

/**
 * Synchronous best-effort lookup.
 * Returns the cached body mass in grams, or FALLBACK_MASS_G if the
 * species is unknown or the CSV has not yet finished loading.
 */
export function getMassByName(scientificName: string): number {
  if (!scientificName) return FALLBACK_MASS_G;
  if (!massCache) return FALLBACK_MASS_G;
  return massCache.get(scientificName) ?? FALLBACK_MASS_G;
}
