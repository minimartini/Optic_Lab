
export enum ApertureType {
  PINHOLE = 'PINHOLE',
  ZONE_PLATE = 'ZONE_PLATE',
  PHOTON_SIEVE = 'PHOTON_SIEVE',
  SLIT = 'SLIT',
  CROSS = 'CROSS',
  SLIT_ARRAY = 'SLIT_ARRAY', // New: Double Slit / Grating
  RANDOM = 'RANDOM',
  ANNULAR = 'ANNULAR',
  MULTI_DOT = 'MULTI_DOT',
  STAR = 'STAR',
  WAVES = 'WAVES', 
  YIN_YANG = 'YIN_YANG',
  URA = 'URA', 
  FREEFORM = 'FREEFORM',
  FIBONACCI = 'FIBONACCI',
  FRACTAL = 'FRACTAL',
  SIERPINSKI_TRIANGLE = 'SIERPINSKI_TRIANGLE',
  LITHO_OPC = 'LITHO_OPC',
  LISSAJOUS = 'LISSAJOUS', // New
  SPIRAL = 'SPIRAL',       // New
  ROSETTE = 'ROSETTE',     // New (Ripples)
  CUSTOM = 'CUSTOM' 
}

export enum MultiDotPattern {
  RING = 'RING',
  LINE = 'LINE',
  GRID = 'GRID',
  RANDOM = 'RANDOM',
  CONCENTRIC = 'CONCENTRIC'
}

export interface CameraConfig {
  focalLength: number;
  sensorWidth: number;
  sensorHeight: number;
  wavelength: number;
  iso: number;
  modelName?: string;
  flangeDistance?: number;
}

export interface ApertureConfig {
  type: ApertureType;
  diameter: number; 
  innerDiameter?: number; 
  zones?: number;
  zonePlateProfile?: 'BINARY' | 'SINUSOIDAL' | 'SPIRAL'; // Added SPIRAL
  seed?: number;
  
  // Simulation Toggles
  usePolychromatic: boolean;
  useVignetting: boolean;
  renderDiffraction?: boolean; 
  
  // Dimensions
  slitWidth?: number; 
  slitHeight?: number; 
  
  // Multi-dot / Pattern
  multiDotPattern?: MultiDotPattern;
  count?: number;
  spread?: number; // Center-to-center distance for Slit Array
  centerDot?: boolean;
  
  // URA / Coded Aperture
  uraRank?: number; 
  
  // Fractal / Star
  iteration?: number;
  rotation?: number;
  spikes?: number;

  // Math Curves (New)
  lissajousRX?: number; // Frequency X
  lissajousRY?: number; // Frequency Y
  lissajousDelta?: number; // Phase Shift
  spiralTurns?: number;
  spiralArms?: number;
  rosettePetals?: number; // For Ripples/Rosette
  
  // Freeform & Custom
  customPath?: {x: number, y: number}[];
  brushSize?: number;
  maskImage?: string | null; 
  maskThreshold?: number; 
  maskInvert?: boolean;
}

export interface SimulationResult {
  geometricBlur: number;
  diffractionBlur: number;
  totalBlur: number;
  optimalDiameter: number;
  fNumber: number;
  fovH: number;
  fovV: number;
  focalLength35mm: number;
  maxFootprint: number;
  isDiffractionLimited: boolean;
  // New metrics for Double Slit
  fringeSpacing?: number; 
  interferenceRating?: string;
}

export interface ExportConfig {
  format: 'SVG' | 'DXF';
  addBridges: boolean;
  inverted: boolean;
  bridgeSizeMm: number;
  sheetWidth: number;
  sheetHeight: number;
  itemSize: number;
  spacing: number;
}

export interface ProductionItem {
  id: string;
  name: string;
  aperture: ApertureConfig;
  camera: CameraConfig;
}

export interface Preset {
  id: string;
  name: string;
  flange: number;
  sensorW: number;
  sensorH: number;
  type: 'Digital' | 'Film' | 'Custom';
}

export const CAMERA_PRESETS: Preset[] = [
  // Digital - Alphabetical
  { id: 'canon_ef', name: 'Canon EF (DSLR)', flange: 44.0, sensorW: 36, sensorH: 24, type: 'Digital' },
  { id: 'canon_rf', name: 'Canon RF (Mirrorless)', flange: 20.0, sensorW: 36, sensorH: 24, type: 'Digital' },
  { id: 'fuji_gfx', name: 'Fujifilm GFX (Medium Format)', flange: 26.7, sensorW: 43.8, sensorH: 32.9, type: 'Digital' },
  { id: 'fuji_x', name: 'Fujifilm X (APS-C)', flange: 17.7, sensorW: 23.6, sensorH: 15.6, type: 'Digital' },
  { id: 'hasselblad_xcd', name: 'Hasselblad XCD', flange: 18.14, sensorW: 43.8, sensorH: 32.9, type: 'Digital' },
  { id: 'l_mount', name: 'L-Mount (Leica/Pan/Sig)', flange: 20.0, sensorW: 36, sensorH: 24, type: 'Digital' },
  { id: 'leica_m', name: 'Leica M (Rangefinder)', flange: 27.8, sensorW: 36, sensorH: 24, type: 'Digital' },
  { id: 'mft', name: 'Micro 4/3', flange: 19.25, sensorW: 17.3, sensorH: 13, type: 'Digital' },
  { id: 'nikon_f', name: 'Nikon F (SLR)', flange: 46.5, sensorW: 36, sensorH: 24, type: 'Digital' },
  { id: 'nikon_z', name: 'Nikon Z (Mirrorless)', flange: 16.0, sensorW: 35.9, sensorH: 23.9, type: 'Digital' },
  { id: 'sony_e', name: 'Sony E (Mirrorless)', flange: 18.0, sensorW: 35.6, sensorH: 23.8, type: 'Digital' },
  
  // Film
  { id: 'film_35', name: '35mm Film Standard', flange: 0, sensorW: 36, sensorH: 24, type: 'Film' },
  { id: 'film_645', name: 'Medium Format 645', flange: 0, sensorW: 56, sensorH: 41.5, type: 'Film' },
  { id: 'film_6x6', name: 'Medium Format 6x6', flange: 0, sensorW: 56, sensorH: 56, type: 'Film' },
  { id: 'large_4x5', name: 'Large Format 4x5', flange: 0, sensorW: 102, sensorH: 127, type: 'Film' },
  { id: 'large_8x10', name: 'Large Format 8x10', flange: 0, sensorW: 203, sensorH: 254, type: 'Film' },
  
  // Custom
  { id: 'custom', name: 'Custom / Homemade', flange: 0, sensorW: 36, sensorH: 24, type: 'Custom' },
];
