/**
 * Artwork path resolution.
 *
 * Artwork filenames use kebab-case scientific names:
 *   "Turdus merula"  → "turdus-merula.webp"
 *   "Accipiter nisus" → "accipiter-nisus.webp"
 *
 * birdnet_aliases.json maps old BirdNET taxonomy to current taxonomy:
 *   "Streptopelia chinensis" → "Spilopelia chinensis"
 * We apply the alias before building the path so BirdNET's older labels
 * resolve to the correctly-named artwork file.
 */

type AliasMap = Record<string, string>;

let aliasCache: AliasMap | null = null;
let loadPromise: Promise<AliasMap> | null = null;

async function loadAliases(): Promise<AliasMap> {
  if (aliasCache) return aliasCache;
  if (loadPromise) return loadPromise;

  loadPromise = fetch('/birdnet_aliases.json')
    .then(r => r.json() as Promise<AliasMap>)
    .then(data => {
      aliasCache = data;
      return data;
    })
    .catch(() => {
      aliasCache = {};
      return {};
    });

  return loadPromise;
}

// Pre-load aliases as soon as this module is imported.
loadAliases();

/** Convert a scientific name to the kebab-case used by artwork filenames. */
function toKebab(scientificName: string): string {
  return scientificName.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Return the public artwork path for a species, or null if not found.
 * Async version — waits for aliases to be loaded.
 *
 * @param scientificName  BirdNET output name, e.g. "Turdus merula"
 * @param style           'classic' | 'custom'
 */
export async function resolveArtworkPath(
  scientificName: string,
  style: 'classic' | 'custom',
): Promise<string | null> {
  if (!scientificName) return null;
  const aliases = await loadAliases();
  // Apply taxonomy alias if present
  const canonical = aliases[scientificName] ?? scientificName;
  return `/artwork/${style}/birds/${toKebab(canonical)}.webp`;
}

/**
 * Synchronous best-effort lookup — uses cached aliases (empty map if not yet loaded).
 * Useful for initial renders; async version is preferred for guaranteed alias resolution.
 */
export function resolveArtworkPathSync(
  scientificName: string,
  _commonName: string,
  style: 'classic' | 'custom',
): string | null {
  if (!scientificName) return null;
  const aliases = aliasCache ?? {};
  const canonical = aliases[scientificName] ?? scientificName;
  return `/artwork/${style}/birds/${toKebab(canonical)}.webp`;
}
