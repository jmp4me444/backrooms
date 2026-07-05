export interface RoomTheme {
  id: string;
  name: string;
  seed: number;
  wallColor: string;

  floorColor: string;
  ceilingColor: string;
  wallTexture: 'default' | 'concrete' | 'tiles' | 'metal' | 'brick' | 'cyber' | 'hospital' | 'mossy';
  floorTexture: 'carpet' | 'concrete' | 'tiles' | 'water' | 'wood' | 'cyber' | 'linoleum';
  ceilingTexture: 'tiles' | 'metal' | 'concrete' | 'cyber' | 'plaster';
  lightingStyle: 'fluorescent' | 'flashlight-only' | 'red-alarm' | 'neon' | 'misty' | 'strobe' | 'white-sterile';
  ambientSound: 'hum' | 'drips' | 'drone' | 'beeps' | 'synth' | 'crickets' | 'static';
  fogColor: string;
  fogDensity: number;
  props: ('column' | 'chair' | 'locker' | 'pipe' | 'vent' | 'hazard' | 'cabinet' | 'puddle' | 'moss' | 'arcade')[];
  entitySpawnChance: number;
}

export interface SearchableItem {
  id: string;
  name: string;
  type: 'file' | 'item' | 'lore';
  position: [number, number, number]; // 3D coordinates
  description: string;
  content: string; // Detail logs
  found: boolean;
}

export interface LevelDossier {
  levelNumber: string;
  levelName: string;
  difficultyClass: 'Class 0' | 'Class 1' | 'Class 2' | 'Class 3' | 'Class 4' | 'Class 5' | 'Class Habitability' | 'Class Undetermined';
  difficultyText: string;
  description: string;
  properties: string[];
  entitiesText: string;
  discoveryLog: string;
}
