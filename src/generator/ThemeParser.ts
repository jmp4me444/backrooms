import type { RoomTheme, LevelDossier, SearchableItem } from '../types';



// Helper to shift the hue of a hex color based on a seed number
function shiftColorHue(hex: string, seed: number): string {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return hex;
  
  let r = parseInt(cleanHex.substring(0, 2), 16) / 255;
  let g = parseInt(cleanHex.substring(2, 4), 16) / 255;
  let b = parseInt(cleanHex.substring(4, 6), 16) / 255;
  
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  
  // Shift hue deterministically based on seed
  const hueShift = (Math.abs(Math.sin(seed * 43.12)) * 1.0);
  h = (h + hueShift) % 1.0;
  
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1/6) return p + (q - p) * 6 * t;
    if (t < 1/2) return q;
    if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
    return p;
  };
  
  let newR = l;
  let newG = l;
  let newB = l;
  
  if (s !== 0) {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const qPrime = 2 * l - q;
    newR = hue2rgb(qPrime, q, h + 1/3);
    newG = hue2rgb(qPrime, q, h);
    newB = hue2rgb(qPrime, q, h - 1/3);
  }
  
  const toHex = (x: number) => {
    const val = Math.round(x * 255).toString(16);
    return val.length === 1 ? '0' + val : val;
  };
  
  return '#' + toHex(newR) + toHex(newG) + toHex(newB);
}

export const parseKeywords = (query: string, seedInput?: number): { theme: RoomTheme; dossier: LevelDossier; items: SearchableItem[] } => {
  const cleanQuery = query.toLowerCase().trim();
  const words = cleanQuery.split(/[\s,]+/);

  const seed = seedInput !== undefined 
    ? Math.floor(seedInput * 1000000) 
    : Math.abs(cleanQuery.split('').reduce((acc, char) => (acc << 5) - acc + char.charCodeAt(0), 0));

  // Default values (Level 0 - Retro Office theme)
  let theme: RoomTheme = {
    id: 'generated_level',
    name: 'Level 0: The Lobby',
    seed: seed,
    wallColor: '#d6c596', // warm yellow wallpaper
    floorColor: '#b09b6c', // tan carpet
    ceilingColor: '#ccbe9f', // ceiling tiles

    wallTexture: 'default',
    floorTexture: 'carpet',
    ceilingTexture: 'tiles',
    lightingStyle: 'fluorescent',
    ambientSound: 'hum',
    fogColor: '#d6c596',
    fogDensity: 0.04,

    props: ['desk', 'computer', 'chair', 'cooler', 'copier', 'coffee', 'cabinet', 'stapler'],
    entitySpawnChance: 0.15,
  };

  // Color name mapping
  const colorMap: { [key: string]: string } = {
    red: '#b71c1c',
    blue: '#0d47a1',
    green: '#1b5e20',
    yellow: '#fbc02d',
    orange: '#e65100',
    purple: '#4a148c',
    pink: '#ad1457',
    cyan: '#00838f',
    teal: '#00695c',
    black: '#151515',
    white: '#eeeeee',
    brown: '#5d4037',
    grey: '#455a64',
    gray: '#455a64',
    gold: '#ffd700',
    magenta: '#d81b60',
    violet: '#5e35b1',
    lime: '#7cb342',
    turquoise: '#00acc1',
    crimson: '#880e4f',
    lavender: '#b39ddb',
    sand: '#e0cda9',
    bamboo: '#81c784',
    mint: '#a7ffeb',
  };

  // Keyword categories
  // Keyword categories with extensive dictionary adjectives
  const hasMetal = words.some(w => ['metal', 'industrial', 'pipe', 'pipes', 'rusty', 'iron', 'factory', 'machinery', 'engine', 'boiler', 'metallic', 'steel', 'brass', 'copper', 'bronze', 'welded', 'mechanical', 'dirty', 'greasy', 'sooty', 'steam', 'exhaust', 'forged', 'manufactured', 'machined'].includes(w));
  const hasWater = words.some(w => ['water', 'pool', 'pools', 'damp', 'flooded', 'submerged', 'wet', 'swimming', 'drip', 'dripping', 'liquid', 'aquatic', 'watery', 'rainy', 'soaked', 'soggy', 'moist', 'drenched', 'ocean', 'sea', 'fluid', 'hydro', 'subaquatic', 'splash', 'splashing', 'misty', 'vapor', 'steamy'].includes(w))
    && !cleanQuery.includes('water cooler') && !cleanQuery.includes('water coolers') && !cleanQuery.includes('coffee machine');
  const hasDark = words.some(w => ['dark', 'night', 'shadow', 'shadows', 'creepy', 'scary', 'dim', 'black', 'spooky', 'void', 'pitch-black', 'obscure', 'gloomy', 'somber', 'eerie', 'sinister', 'ghastly', 'haunted', 'nocturnal', 'abyssal', 'tenebrous', 'murky'].includes(w));
  const hasSterile = words.some(w => ['sterile', 'hospital', 'medical', 'clinic', 'white', 'clean', 'laboratory', 'lab', 'dentist', 'hygienic', 'clinical', 'sanitized', 'surgical', 'bleached', 'pure', 'asylum', 'dental', 'disinfected', 'immaculate', 'spotless'].includes(w));
  const hasArcade = words.some(w => ['arcade', 'neon', 'game', 'play', 'synth', 'cyber', 'retro', 'computer', 'digital', 'glowing', 'electronic', 'futuristic', 'holographic', 'pixelated', 'pixel', 'vaporwave', 'techno', 'electric', 'flashing'].includes(w));
  const hasNature = words.some(w => ['nature', 'forest', 'moss', 'green', 'garden', 'plants', 'wood', 'dirt', 'foliage', 'overgrown', 'botanical', 'grassy', 'verdant', 'lush', 'wild', 'forested', 'leafy'].includes(w));
  const hasEntity = words.some(w => ['entity', 'monster', 'ghost', 'scary', 'shadowy', 'haunted', 'lurker', 'beast', 'danger', 'hazard', 'hostile', 'deadly', 'creature', 'threat'].includes(w));
  
  // New categories
  const hasTropical = words.some(w => ['tropical', 'beach', 'sand', 'palm', 'jungle', 'bamboo', 'summer', 'hawaii', 'island', 'oasis', 'coconut', 'exotic', 'sunny', 'warm', 'sandy', 'safari', 'equatorial'].includes(w));
  const hasLava = words.some(w => ['lava', 'magma', 'volcano', 'fire', 'hell', 'burning', 'hot', 'flames', 'coals', 'inferno', 'fiery', 'blazing', 'scorching', 'sizzling', 'scalded', 'scalding', 'sweltering', 'torrid', 'volcanic', 'thermal', 'igneous', 'molten', 'glowing-hot'].includes(w));
  const hasSnow = words.some(w => ['snow', 'ice', 'icy', 'icey', 'cold', 'arctic', 'frozen', 'blizzard', 'winter', 'glacier', 'chill', 'frost', 'frigid', 'freezing', 'snowy', 'chilly', 'polar', 'glacial', 'gelid', 'wintry', 'frosty', 'subzero', 'boreal', 'hyperborean'].includes(w));
  const hasDesert = words.some(w => ['desert', 'dusty', 'ruins', 'sandstorm', 'ancient', 'tomb', 'pyramid', 'dunes', 'arid', 'barren', 'dry', 'dehydrated', 'wasted', 'ruined', 'decayed', 'decaying', 'antique', 'historical', 'archeological'].includes(w));
  const hasGold = words.some(w => ['gold', 'golden', 'palace', 'royal', 'rich', 'luxury', 'treasure', 'wealth', 'valuable', 'gilded', 'wealthy', 'luxurious', 'affluent', 'opulent', 'regal', 'imperial', 'stately', 'shining', 'brilliant', 'glittering', 'sparkling'].includes(w));
  const hasCircus = words.some(w => ['circus', 'carnival', 'clown', 'tent', 'fair', 'fairground', 'carousel', 'funhouse', 'jester'].includes(w));
  const hasMatrix = words.some(w => ['matrix', 'code', 'binary', 'digital', 'neo', 'simulation', 'mainframe'].includes(w));

  // Determine dominant theme
  if (hasMetal) {
    theme.name = 'Industrial Maintenance Sector';
    theme.wallColor = '#877b72'; // brightened rusty metal
    theme.floorColor = '#5e5e5e'; // brightened concrete
    theme.ceilingColor = '#7c7067';
    theme.wallTexture = 'metal';
    theme.floorTexture = 'concrete';
    theme.ceilingTexture = 'metal';
    theme.lightingStyle = 'red-alarm';
    theme.ambientSound = 'drone';
    theme.fogColor = '#594d44';
    theme.fogDensity = 0.038;
    theme.props = ['column', 'pipe', 'vent', 'locker', 'hazard'];
    theme.entitySpawnChance = 0.4;
  } else if (hasWater) {
    theme.name = 'Level 37: Submerged Poolrooms';
    theme.wallColor = '#cbebee'; // clean light cyan pool tiles
    theme.floorColor = '#125463'; // deep pool water
    theme.ceilingColor = '#cbebee';
    theme.wallTexture = 'tiles';
    theme.floorTexture = 'water';
    theme.ceilingTexture = 'tiles';
    theme.lightingStyle = 'misty';
    theme.ambientSound = 'drips';
    theme.fogColor = '#103f4a';
    theme.fogDensity = 0.032;
    theme.props = ['duck', 'floatie', 'pool-chair', 'fountain', 'bridge'];
    theme.entitySpawnChance = 0.05;
  } else if (hasTropical) {
    theme.name = 'Level T: The Tropical Oasis';
    theme.wallColor = '#a3c293'; // bamboo green
    theme.floorColor = '#a3c293'; // matches wall color
    theme.ceilingColor = '#a3c293'; // matches wall color
    theme.wallTexture = 'bamboo';
    theme.floorTexture = 'sand';
    theme.ceilingTexture = 'thatch';
    theme.lightingStyle = 'sunlight';
    theme.ambientSound = 'waves'; // looping ocean wave swells
    theme.fogColor = '#daf6fc';
    theme.fogDensity = 0.016;
    theme.props = ['moss', 'puddle', 'column'];
    theme.entitySpawnChance = 0.1;
  } else if (hasLava) {
    theme.name = 'Level 666: The Underworld Boiler';
    theme.wallColor = '#3e2723'; // sooty brown brick
    theme.floorColor = '#ff3d00'; // magma orange-red
    theme.ceilingColor = '#151515';
    theme.wallTexture = 'brick';
    theme.floorTexture = 'concrete';
    theme.ceilingTexture = 'metal';
    theme.lightingStyle = 'red-alarm';
    theme.ambientSound = 'drone';
    theme.fogColor = '#bf360c';
    theme.fogDensity = 0.08;
    theme.props = ['pipe', 'hazard', 'column'];
    theme.entitySpawnChance = 0.65;
  } else if (hasSnow) {
    theme.name = 'Level C: The Frozen Archive';
    theme.wallColor = '#e0f7fa'; // icy blue tiles
    theme.floorColor = '#ffffff'; // snow white
    theme.ceilingColor = '#b2ebf2';
    theme.wallTexture = 'brick';
    theme.floorTexture = 'linoleum'; // slippery glacier sheet
    theme.ceilingTexture = 'plaster';
    theme.lightingStyle = 'white-sterile';
    theme.ambientSound = 'drone';
    theme.fogColor = '#e0f2f1';
    theme.fogDensity = 0.07;
    theme.props = ['column', 'locker', 'cabinet'];
    theme.entitySpawnChance = 0.2;
  } else if (hasDesert) {
    theme.name = 'Level D: The Dusty Ruins';
    theme.wallColor = '#d7ccc8'; // dusty sandstone brick
    theme.floorColor = '#a1887f'; // clay dirt
    theme.ceilingColor = '#8d6e63';
    theme.wallTexture = 'default';
    theme.floorTexture = 'concrete';
    theme.ceilingTexture = 'concrete';
    theme.lightingStyle = 'flashlight-only';
    theme.ambientSound = 'drone';
    theme.fogColor = '#8d6e63';
    theme.fogDensity = 0.11;
    theme.props = ['column', 'cabinet', 'puddle'];
    theme.entitySpawnChance = 0.35;
  } else if (hasGold) {
    theme.name = 'Level G: The Golden Palace';
    theme.wallColor = '#ffd700'; // glowing gold tiles
    theme.floorColor = '#ffb300';
    theme.ceilingColor = '#ffe082';
    theme.wallTexture = 'tiles';
    theme.floorTexture = 'wood';
    theme.ceilingTexture = 'tiles';
    theme.lightingStyle = 'fluorescent';
    theme.ambientSound = 'synth';
    theme.fogColor = '#ffb300';
    theme.fogDensity = 0.03;
    theme.props = ['column', 'puddle'];
    theme.entitySpawnChance = 0.15;
  } else if (hasCircus) {
    theme.name = 'Level 99: The Funhouse';
    theme.wallColor = '#d32f2f'; // circus red
    theme.floorColor = '#fbc02d'; // carnival yellow
    theme.ceilingColor = '#0d47a1'; // circus tent dark blue
    theme.wallTexture = 'circus';
    theme.floorTexture = 'checkerboard';
    theme.ceilingTexture = 'plaster';
    theme.lightingStyle = 'strobe';
    theme.ambientSound = 'synth'; // warped circus synth music
    theme.fogColor = '#1a0033'; // deep purple void fog
    theme.fogDensity = 0.07;
    theme.props = ['column', 'puddle', 'cabinet'];
    theme.entitySpawnChance = 0.45;
  } else if (hasMatrix) {
    theme.name = 'Level M: The Matrix Core';
    theme.wallColor = '#1a3c20';
    theme.floorColor = '#102a15';
    theme.ceilingColor = '#1a3c20';
    theme.wallTexture = 'matrix';
    theme.floorTexture = 'matrix';
    theme.ceilingTexture = 'matrix';
    theme.lightingStyle = 'matrix'; // green matrix glow
    theme.ambientSound = 'static'; // mainframe hum
    theme.fogColor = '#0b2611';
    theme.fogDensity = 0.022;
    theme.props = ['column', 'vent'];
    theme.entitySpawnChance = 0.25;
  } else if (hasSterile) {
    theme.name = 'Sterile Ward';
    theme.wallColor = '#e3eef0'; // clinical pale blue-white
    theme.floorColor = '#ccd6d8'; // linoleum
    theme.ceilingColor = '#eef3f5';
    theme.wallTexture = 'hospital';
    theme.floorTexture = 'linoleum';
    theme.ceilingTexture = 'plaster';
    theme.lightingStyle = 'white-sterile';
    theme.ambientSound = 'beeps';
    theme.fogColor = '#d9e2e3';
    theme.fogDensity = 0.03;
    theme.props = ['cabinet', 'locker', 'column'];
    theme.entitySpawnChance = 0.3;
  } else if (hasArcade) {
    theme.name = 'Neon Playrooms';
    theme.wallColor = '#1a052e'; // dark purple neon grid
    theme.floorColor = '#0a0014';
    theme.ceilingColor = '#100022';
    theme.wallTexture = 'cyber';
    theme.floorTexture = 'cyber';
    theme.ceilingTexture = 'cyber';
    theme.lightingStyle = 'neon';
    theme.ambientSound = 'synth';
    theme.fogColor = '#1a052e';
    theme.fogDensity = 0.05;
    theme.props = ['arcade', 'column'];
    theme.entitySpawnChance = 0.2;
  } else if (hasNature) {
    theme.name = 'Overgrown Arbour';
    theme.wallColor = '#3c3f30'; // mossy brick
    theme.floorColor = '#252119'; // dark soil/wood
    theme.ceilingColor = '#2f3b2f';
    theme.wallTexture = 'brick';
    theme.floorTexture = 'wood';
    theme.ceilingTexture = 'concrete';
    theme.lightingStyle = 'misty';
    theme.ambientSound = 'crickets';
    theme.fogColor = '#283220';
    theme.fogDensity = 0.08;
    theme.props = ['moss', 'column', 'puddle'];
    theme.entitySpawnChance = 0.25;
  }

  // Dynamic color overrides if user typed color words
  const foundColor = words.find(w => colorMap[w]);
  if (foundColor) {
    const col = colorMap[foundColor];
    theme.wallColor = col;
    theme.fogColor = col;
    if (foundColor === 'black' || foundColor === 'dark') {
      theme.floorColor = '#101010';
      theme.ceilingColor = '#1a1a1a';
    } else if (foundColor === 'white' || foundColor === 'clean') {
      theme.floorColor = '#ffffff';
      theme.ceilingColor = '#f9f9f9';
    } else {
      theme.floorColor = col;
      theme.ceilingColor = col;
    }
  }

  // Modifiers
  if (hasDark) {
    theme.lightingStyle = 'flashlight-only';
    theme.fogColor = '#020202';
    theme.fogDensity = 0.16;
    if (theme.ambientSound === 'hum') theme.ambientSound = 'drone';
    theme.entitySpawnChance = Math.max(theme.entitySpawnChance, 0.6);
  }

  if (hasEntity) {
    theme.entitySpawnChance = 0.95;
    if (theme.lightingStyle === 'fluorescent') {
      theme.lightingStyle = 'strobe';
    }
    theme.ambientSound = 'static';
    if (!theme.props.includes('hazard')) {
      theme.props.push('hazard');
    }
  }

  // Create the Level Dossier using the random seed (no redeclaration)
  const levelNum = `Level K-${(seed % 900) + 100}`;
  
  // Custom generated Title
  let levelTitle = '';
  const adjectives = ['Humid', 'Industrial', 'Desolate', 'Sterile', 'Dripping', 'Monotonous', 'Neon', 'Echoing', 'Shadowy', 'Neglected'];
  const nouns = ['Lobby', 'Pipes', 'Sanctuary', 'Ward', 'Plaza', 'Corridors', 'Tunnels', 'Chambers', 'Catacombs', 'Vaults'];
  
  const adj = adjectives[seed % adjectives.length];
  const n = nouns[(seed >> 2) % nouns.length];
  levelTitle = `"${adj} ${n}"`;

  // Difficulty Class logic
  let diffClass: LevelDossier['difficultyClass'] = 'Class 1';
  let diffText = 'Safe, Secure, Low Entity Count';

  const severityScore = (hasDark ? 2 : 0) + (hasEntity ? 3 : 0) + (hasMetal ? 1 : 0) + (hasWater ? 0 : 0) + (hasSterile ? 1 : 0) + (hasLava ? 2 : 0);
  if (severityScore === 0) {
    diffClass = 'Class 0';
    diffText = 'Safe, Secure, Devoid of Entities';
  } else if (severityScore <= 2) {
    diffClass = 'Class 1';
    diffText = 'Safe, Secure, Minimal Entity Count';
  } else if (severityScore <= 3) {
    diffClass = 'Class 2';
    diffText = 'Unsafe, Secure, Low Entity Count';
  } else if (severityScore <= 4) {
    diffClass = 'Class 3';
    diffText = 'Unsafe, Unsecure, Low Entity Count';
  } else if (severityScore <= 5) {
    diffClass = 'Class 4';
    diffText = 'Unsafe, Unsecure, Medium Entity Count';
  } else {
    diffClass = 'Class 5';
    diffText = 'Deadly, Unsecure, High Entity Count';
  }

  // Dynamic dossier description builder
  let desc = `**${levelNum}**, colloquially known as **${levelTitle}**, is a non-Euclidean pocket dimension generated by the console. `;
  
  if (hasMetal) {
    desc += `It consists of massive networks of piping, high-temperature machinery, and narrow walkways constructed of corroded steel. Steam occasionally vents from overhead piping, creating dangerous thermal hazards. `;
  } else if (hasWater) {
    desc += `It manifests as a vast, labyrinthine complex of clean, warm pools of water, illuminated by a soft, diffuse light. The structures are composed of pristine tiles, and the depth of the water remains consistently shallow, though anomalous deep shafts exist. `;
  } else if (hasTropical) {
    desc += `It manifests as an anomalies-heavy beachside lobby or greenhouse atrium. The walls resemble lush green bamboo grids, and the floor is a layer of warm beach sand. A soft turquoise sky-like ceiling reflects warm solar arrays above. `;
  } else if (hasLava) {
    desc += `It is a high-risk boiler region resembling an active volcanic chamber. The concrete flooring is fractured, showing pools of glowing, active molten lava underneath. Red flashing warning signals reflect off dark, soot-covered brick pillars. `;
  } else if (hasSnow) {
    desc += `It is an extremely cold, quiet sector structured like a winter ice archive. The brick walls are layered with thick frost sheets, and floor layers are constructed of slippery linoleum resembling blue glacial ice. `;
  } else if (hasDesert) {
    desc += `It manifests as a dark, dusty sandstone tomb. Sand storms occasionally blow dust particles through column corridors, reducing visibility to a few meters and forcing explorers to rely on spotlights. `;
  } else if (hasGold) {
    desc += `It is a highly decorative vault containing golden tiles, polished columns, and yellow gold wood flooring. The lighting is extremely bright and warm, reflecting a golden shimmer across the corridors. `;
  } else if (hasSterile) {
    desc += `It is structured like an endless clinical ward, featuring white vinyl floors, metal cabinets, and sterile partitions. The lighting is extremely bright and sterile, emitting a slight frequency that registers as a metallic whistle. `;
  } else if (hasArcade) {
    desc += `It resembles a massive arcade or digital simulation domain. The walls and floors are lined with neon vector grids, glowing purple and teal. Occasional non-functional arcade cabinets line the walls, displaying scrambled digital code. `;
  } else if (hasNature) {
    desc += `It is a damp, stone-brick subterranean garden. Massive columns are covered in dense ivy, and standard brickwork is heavily weathered by moss. Crickets can be heard in the distance, though no physical insects have ever been spotted. `;
  } else {
    desc += `It manifests as an infinite maze of random office spaces, storage areas, and empty hallways. The walls are covered in a faded, grid-patterned yellow wallpaper, and the floor is lined with damp beige carpets that emit a smell of stale water. `;
  }

  if (hasDark) {
    desc += `The entire zone is plunged into pitch-black darkness. Standard light sources fail to illuminate more than a few meters, requiring explorers to utilize spotlights or high-power flashlights to navigate safely. `;
  } else {
    desc += `The level is illuminated by fluorescent tube grids embedded in the ceiling. They emit a constant, low-frequency electrical buzz that has been measured at 60Hz. `;
  }

  if (hasEntity) {
    desc += `Extreme caution is advised: high-threat entities, specifically "Smilers" and shadowy humanoids, are known to populate the darker corners of this sector. Glitch static has been recorded on video tapes in the vicinity of these entities. `;
  }

  // Properties list
  const propsList = ['Non-Euclidean geometry makes returning pathing unreliable.'];
  if (hasMetal) {
    propsList.push('Thermal exhaust vents that release scalding steam.');
    propsList.push('Structural degradation due to rusting pipe corrosion.');
  }
  if (hasWater) {
    propsList.push('Acoustic echo loops that disorient audio navigation.');
    propsList.push('Shallow water layers of unknown composition (possibly Almond Water mixed with brackish fluids).');
  }
  if (hasTropical) {
    propsList.push('Vegetation that grows rapidly under artificial solar arrays.');
    propsList.push('A persistent sea-breeze microclimate within the corridors.');
  }
  if (hasLava) {
    propsList.push('Scalding floor coordinates showing active magma.');
    propsList.push('High thermal radiation causing rapid battery exhaustion.');
  }
  if (hasSnow) {
    propsList.push('Extreme sub-zero atmospheric readings.');
    propsList.push('Slippery flooring coordinates restricting rapid locomotion.');
  }
  if (hasDesert) {
    propsList.push('Airborne sandstone dust requiring respirator filtration.');
  }
  if (hasGold) {
    propsList.push('Highly conductive surfaces that redirect electrical hazards.');
  }
  if (hasSterile) {
    propsList.push('Sterility anomaly: biological tissue heals 10% faster, but electronic batteries drain twice as fast.');
    propsList.push('Intermittent chime signals emitting from wall speaker structures.');
  }
  if (hasArcade) {
    propsList.push('Electromagnetic fields emitting from grid lines causing visual aberrations.');
    propsList.push('Arcade terminals that can occasionally be booted to play corrupted text adventures.');
  }
  if (hasNature) {
    propsList.push('Vegetable matter that absorbs sound, making footprints completely silent.');
    propsList.push('Puddles containing highly acidic moisture.');
  }
  if (hasDark) {
    propsList.push('Sensory deprivation effects: staying in the dark for more than 2 hours leads to auditory hallucinations.');
  }

  const entitiesText = hasEntity 
    ? 'High presence of Smilers, Skin-Stealers, and active shadow humanoids. Avoid contact and turn off light sources if a low vibration hum increases.'
    : hasWater 
    ? 'Virtually devoid of entities. Rare reports of Dullers hiding near water filters.'
    : 'Minimal entity count. Occasional Hounds or Dullers have been documented passing through ventilation systems.';

  const discoveryLog = `M.E.G. Scout report dated 2024-04-12: "We found ourselves in a room fitting keyword profile '${cleanQuery || 'default'}'. The air was dry, carrying a distinct trace of ${hasMetal ? 'rust' : hasWater ? 'chlorine' : hasSterile ? 'disinfectant' : 'dust'}. Recommendation: Classify as ${levelNum} and monitor."`;

  const dossier: LevelDossier = {
    levelNumber: levelNum,
    levelName: levelTitle,
    difficultyClass: diffClass,
    difficultyText: diffText,
    description: desc,
    properties: propsList,
    entitiesText,
    discoveryLog,
  };

  // Generate 3 random items/logs out of a pool of 6
  const itemPool: SearchableItem[] = [
    {
      id: 'meg_journal',
      name: 'M.E.G. Log Entry #84',
      type: 'file',
      position: [-6, 0.5, -4],
      description: 'A charred paper log folder lying on the floor.',
      content: `<h3>M.E.G. LOG ENTRY #84: EXPLORATION NOTE</h3>
               <p><strong>Explorer:</strong> Agent Henderson</p>
               <p>We've been walking in circles for what feels like 16 hours. The room geometry changes when you look away. Henderson swear he saw a doorway that wasn't there before, leading to a flooded pool corridor. We are running low on Almond Water. If anyone finds this, do not follow the pipes. They lead deeper, where the hum gets louder.</p>`,
      found: false,
    },
    {
      id: 'almond_water',
      name: 'Bottle of Almond Water',
      type: 'item',
      position: [4, 0.2, -6],
      description: 'A plastic sports bottle containing a cloudy sweet liquid.',
      content: `<h3>ITEM DOSSIER: ALMOND WATER</h3>
               <p><strong>Classification:</strong> Vital Supply</p>
               <p>Almond Water is a sweet, cloudy water found throughout the Backrooms. It is the primary means of maintaining sanity and health. Drinking this bottle restores focus. The cap is sealed, with a label reading: <i>"M.E.G. Standard Issue - Bottled in Level 4."</i></p>`,
      found: false,
    },
    {
      id: 'cassette_tape',
      name: 'V.H.S. Cassette Tape',
      type: 'lore',
      position: [-1, 0.4, 6],
      description: 'A black magnetic cassette tape sitting on a plastic shelf.',
      content: `<h3>VHS MEMORY CAPTURE: ASYNC PROJECT 1989</h3>
               <p><strong>Tape Label:</strong> "TEST DRIVE - ROOM 105"</p>
               <p>Audio transcript matches a low-frequency motor hum and a researcher shouting: <i>"The portal is stabilizing! Output matches keywords inputted into the console. The walls are... wait, is that yellow wallpaper? Get the camera closer... Oh god, the hum! Turn it off! Turn it of--"</i>. The tape ends in static.</p>`,
      found: false,
    },
    {
      id: 'old_compass',
      name: 'Survey Brass Compass',
      type: 'item',
      position: [-3, 0.2, 5],
      description: 'A heavy brass compass. The needle spins erratically.',
      content: `<h3>M.E.G. SURVEY ITEM: COMPASS DETECTOR</h3>
               <p><strong>Classification:</strong> Navigation Gear</p>
               <p>A standard compass has been found to spin continuously in sectors with non-Euclidean layouts, proving magnetic poles do not exist in these coordinates. Do not use for navigation inside corridors.</p>`,
      found: false,
    },
    {
      id: 'broken_flashlight',
      name: 'Metallic Flashlight',
      type: 'item',
      position: [5, 0.3, 3],
      description: 'A metallic heavy-duty flashlight with a cracked lens.',
      content: `<h3>EXPLORER GEAR: FLASHLIGHT</h3>
               <p><strong>Classification:</strong> Light Utility</p>
               <p>A discarded flashlight. The battery is low, and the internal contact spring is rusted, causing the bulb to flicker when tapped. It still emits a faint beam if shaken.</p>`,
      found: false,
    },
    {
      id: 'geiger_counter',
      name: 'Geiger Counter Readout',
      type: 'lore',
      position: [-4, 0.4, -2],
      description: 'A yellow radiation detector showing active dials.',
      content: `<h3>M.E.G. LOG DETECTOR: GEIGER READOUT</h3>
               <p><strong>Classification:</strong> Environmental Scanner</p>
               <p>Radiation levels read safe, but the audio clicks spike whenever approaching anomalous columns or door joints, indicating mild electromagnetic decay surrounding noclipping seams.</p>`,
      found: false,
    }
  ];

  // Seed-based shuffle to select 3 random items
  const shuffled = [...itemPool];
  let tempSeed = seed;
  for (let i = shuffled.length - 1; i > 0; i--) {
    tempSeed = (tempSeed * 9301 + 49297) % 233280;
    const j = Math.floor((tempSeed / 233280) * (i + 1));
    const temp = shuffled[i];
    shuffled[i] = shuffled[j];
    shuffled[j] = temp;
  }
  const items = shuffled.slice(0, 3);

  // Position items based on seed coordinates in open cell coordinates
  items.forEach((item, idx) => {
    const valX = -5 + ((seed >> (idx * 2)) % 11);
    const valZ = -5 + ((seed >> (idx * 2 + 3)) % 11);
    item.position = [valX, 0.3, valZ];
  });



  return { theme, dossier, items };
};

export const checkStaticMatch = (query: string): boolean => {
  const cleanQuery = query.toLowerCase().trim();
  const words = cleanQuery.split(/[\s,]+/);

  const METAL_KEYWORDS = ['metal', 'industrial', 'pipe', 'pipes', 'rusty', 'iron', 'factory', 'machinery', 'engine', 'boiler', 'metallic', 'steel', 'brass', 'copper', 'bronze', 'welded', 'mechanical', 'dirty', 'greasy', 'sooty', 'steam', 'exhaust', 'forged', 'manufactured', 'machined'];
  const WATER_KEYWORDS = ['water', 'pool', 'pools', 'damp', 'flooded', 'submerged', 'wet', 'swimming', 'drip', 'dripping', 'liquid', 'aquatic', 'watery', 'rainy', 'soaked', 'soggy', 'moist', 'drenched', 'ocean', 'sea', 'fluid', 'hydro', 'subaquatic', 'splash', 'splashing', 'misty', 'vapor', 'steamy'];
  const DARK_KEYWORDS = ['dark', 'night', 'shadow', 'shadows', 'creepy', 'scary', 'dim', 'black', 'spooky', 'void', 'pitch-black', 'obscure', 'gloomy', 'somber', 'eerie', 'sinister', 'ghastly', 'haunted', 'nocturnal', 'abyssal', 'tenebrous', 'murky'];
  const STERILE_KEYWORDS = ['sterile', 'hospital', 'medical', 'clinic', 'white', 'clean', 'laboratory', 'lab', 'dentist', 'hygienic', 'clinical', 'sanitized', 'surgical', 'bleached', 'pure', 'asylum', 'dental', 'disinfected', 'immaculate', 'spotless'];
  const ARCADE_KEYWORDS = ['arcade', 'neon', 'game', 'play', 'synth', 'cyber', 'retro', 'computer', 'digital', 'glowing', 'electronic', 'futuristic', 'holographic', 'pixelated', 'pixel', 'vaporwave', 'techno', 'electric', 'flashing'];
  const NATURE_KEYWORDS = ['nature', 'forest', 'moss', 'green', 'garden', 'plants', 'wood', 'dirt', 'foliage', 'overgrown', 'botanical', 'grassy', 'verdant', 'lush', 'wild', 'forested', 'leafy'];
  const ENTITY_KEYWORDS = ['entity', 'monster', 'ghost', 'scary', 'shadowy', 'haunted', 'lurker', 'beast', 'danger', 'hazard', 'hostile', 'deadly', 'creature', 'threat'];
  const TROPICAL_KEYWORDS = ['tropical', 'beach', 'sand', 'palm', 'jungle', 'bamboo', 'summer', 'hawaii', 'island', 'oasis', 'coconut', 'exotic', 'sunny', 'warm', 'sandy', 'safari', 'equatorial'];
  const LAVA_KEYWORDS = ['lava', 'magma', 'volcano', 'fire', 'hell', 'burning', 'hot', 'flames', 'coals', 'inferno', 'fiery', 'blazing', 'scorching', 'sizzling', 'scalded', 'scalding', 'sweltering', 'torrid', 'volcanic', 'thermal', 'igneous', 'molten', 'glowing-hot'];
  const SNOW_KEYWORDS = ['snow', 'ice', 'icy', 'icey', 'cold', 'arctic', 'frozen', 'blizzard', 'winter', 'glacier', 'chill', 'frost', 'frigid', 'freezing', 'snowy', 'chilly', 'polar', 'glacial', 'gelid', 'wintry', 'frosty', 'subzero', 'boreal', 'hyperborean'];
  const DESERT_KEYWORDS = ['desert', 'dusty', 'ruins', 'sandstorm', 'ancient', 'tomb', 'pyramid', 'dunes', 'arid', 'barren', 'dry', 'dehydrated', 'wasted', 'ruined', 'decayed', 'decaying', 'antique', 'historical', 'archeological'];
  const GOLD_KEYWORDS = ['gold', 'golden', 'palace', 'royal', 'rich', 'luxury', 'treasure', 'wealth', 'valuable', 'gilded', 'wealthy', 'luxurious', 'affluent', 'opulent', 'regal', 'imperial', 'stately', 'shining', 'brilliant', 'glittering', 'sparkling'];
  const CIRCUS_KEYWORDS = ['circus', 'carnival', 'clown', 'tent', 'fair', 'fairground', 'carousel', 'funhouse', 'jester'];
  const MATRIX_KEYWORDS = ['matrix', 'code', 'binary', 'digital', 'neo', 'simulation', 'mainframe'];
  const LOBBY_KEYWORDS = ['lobby', 'office', 'carpet', 'hum', 'yellow', 'beige', 'fluorescent', 'retro'];

  const allKeywords = [
    ...METAL_KEYWORDS, ...WATER_KEYWORDS, ...DARK_KEYWORDS, ...STERILE_KEYWORDS,
    ...ARCADE_KEYWORDS, ...NATURE_KEYWORDS, ...ENTITY_KEYWORDS, ...TROPICAL_KEYWORDS,
    ...LAVA_KEYWORDS, ...SNOW_KEYWORDS, ...DESERT_KEYWORDS, ...GOLD_KEYWORDS, ...CIRCUS_KEYWORDS,
    ...MATRIX_KEYWORDS, ...LOBBY_KEYWORDS
  ];

  return words.some(w => allKeywords.includes(w));
};

export const expandKeywordsWithDictionary = async (query: string): Promise<string> => {
  const cleanQuery = query.toLowerCase().trim();
  const words = cleanQuery.split(/[\s,]+/);

  if (checkStaticMatch(query)) {
    return query;
  }

  const stopwords = ['the', 'room', 'level', 'zone', 'sector', 'area', 'with', 'some', 'and', 'walls', 'floor', 'ceiling', 'hall', 'halls'];
  const lookupWord = words.find(w => w.length > 3 && !stopwords.includes(w));

  if (!lookupWord) return query;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);

    const response = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${lookupWord}`, { signal: controller.signal });
    clearTimeout(timeoutId);

    if (!response.ok) return query;

    const data = await response.json();
    if (!Array.isArray(data) || data.length === 0) return query;

    const meaningsText: string[] = [];
    data.forEach(entry => {
      if (entry.meanings) {
        entry.meanings.forEach((meaning: any) => {
          if (meaning.definitions) {
            meaning.definitions.forEach((def: any) => {
              meaningsText.push(def.definition);
              if (def.synonyms) {
                meaningsText.push(...def.synonyms);
              }
            });
          }
          if (meaning.synonyms) {
            meaningsText.push(...meaning.synonyms);
          }
        });
      }
    });

    const expandedWords = meaningsText.join(' ').toLowerCase();
    return `${query}, ${expandedWords}`;
  } catch (error) {
    console.warn('Runtime dictionary expansion skipped:', error);
    return query;
  }
};
