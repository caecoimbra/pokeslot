import { demoRedemptionDetails, demoRedemptionSpecies } from '../domain/demo-redemption.mjs';

export function buildKantoCatalog(ownedVariants) {
  const entries = new Map(demoRedemptionSpecies.map((speciesId) => [speciesId, {
    speciesId, normal: false, shiny: false,
  }]));
  for (const variant of ownedVariants) {
    const entry = entries.get(variant?.speciesId);
    if (!entry || typeof variant.isShiny !== 'boolean') throw new TypeError('Invalid Kanto variant');
    entry[variant.isShiny ? 'shiny' : 'normal'] = true;
  }
  return [...entries.values()];
}

const normalizeName = (value) => value.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '');

export function filterKantoCatalog(catalog, query, variant, registration, labelFor = () => '', rarity = 'all') {
  const search = query.trim();
  const number = /^#?\d+$/.test(search) ? Number(search.replace(/^#/, '')) : null;
  if (number === null && search.startsWith('#')) return [];
  if (!['all', 'normal', 'shiny'].includes(variant) || !['all', 'owned', 'missing'].includes(registration)) return [];
  if (!['all', 'common', 'uncommon', 'rare', 'legendary'].includes(rarity)) return [];
  const name = normalizeName(search);

  return catalog.filter((entry) => {
    const owned = variant === 'all' ? entry.normal || entry.shiny : entry[variant];
    if (registration === 'owned' && !owned || registration === 'missing' && owned) return false;
    if (rarity !== 'all' && demoRedemptionDetails(entry.speciesId).rarity !== rarity) return false;
    if (!search) return true;
    if (number !== null) return entry.speciesId === number;
    return (entry.normal || entry.shiny) && normalizeName(labelFor(entry.speciesId) ?? '').includes(name);
  });
}
