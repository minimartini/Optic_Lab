
import { ApertureConfig, ApertureType, MultiDotPattern, CameraConfig, SimulationResult } from '../types';

export const DEFAULT_WAVELENGTH = 550;

export const PHYSICS_CONSTANTS = {
  WAVELENGTH_TO_MM: 1e-6,
  RAYLEIGH_FACTOR: 1.9,
  DEFAULT_ZONES: 10,
  MIN_DIAMETER_MM: 0.001,
  AIRY_DISK_FACTOR: 2.44,
  RGB_WAVELENGTHS: [640, 540, 460] // Standardized sRGB Primaries
};

const generateURA = (rank: number) => {
    const p = rank;
    const grid = new Int8Array(p * p);
    
    const isQuadraticResidue = (n: number, m: number) => {
        if (n === 0) return 0;
        for (let x = 1; x < m; x++) {
            if ((x * x) % m === n) return 1;
        }
        return -1;
    };

    for (let i = 0; i < p; i++) {
        for (let j = 0; j < p; j++) {
            if (i === 0) {
                 grid[i*p + j] = 0;
            } else if (j === 0) {
                 grid[i*p + j] = 1;
            } else {
                 const C_i = isQuadraticResidue(i, p);
                 const C_j = isQuadraticResidue(j, p);
                 grid[i*p + j] = (C_i * C_j) === 1 ? 1 : 0;
            }
        }
    }
    return grid;
};

const calculateOpenArea = (aperture: ApertureConfig): number => {
    const d = aperture.diameter;
    const r = d / 2;

    switch (aperture.type) {
        case ApertureType.PINHOLE:
            return Math.PI * r * r;

        case ApertureType.ZONE_PLATE:
            return (Math.PI * r * r) / 2;

        case ApertureType.PHOTON_SIEVE:
            return (Math.PI * r * r) * 0.30;

        case ApertureType.SLIT:
            return (aperture.slitWidth || 0.2) * (aperture.diameter || 5.0);

        case ApertureType.SLIT_ARRAY: {
            const n = aperture.count || 2;
            const w = aperture.slitWidth || 0.2;
            const h = aperture.diameter || 5.0;
            return n * w * h;
        }

        case ApertureType.CROSS:
            const cw = aperture.slitWidth || 0.2;
            const l = aperture.diameter || 5.0;
            return (2 * cw * l) - (cw * cw);

        case ApertureType.ANNULAR:
            const rOut = d / 2;
            const rIn = (aperture.innerDiameter || d * 0.5) / 2;
            return Math.PI * (rOut * rOut - rIn * rIn);

        case ApertureType.MULTI_DOT:
        case ApertureType.RANDOM:
        case ApertureType.FIBONACCI:
            const count = aperture.count || 1;
            const dotR = (aperture.diameter || 0.2) / 2;
            return count * Math.PI * dotR * dotR;

        case ApertureType.URA:
            const rank = aperture.uraRank || 13;
            return (d * d) * 0.5; 

        case ApertureType.WAVES:
        case ApertureType.YIN_YANG:
            const width = aperture.diameter || 10;
            const amp = aperture.slitHeight || 2.0;
            const waves = aperture.count || 1;
            const thick = aperture.slitWidth || 0.1;
            const len = Math.sqrt(width**2 + (2*waves*amp)**2); 
            let area = len * thick;
            if (aperture.type === ApertureType.YIN_YANG) {
                const dR = (aperture.innerDiameter || 0.2)/2;
                area += (waves * 2) * (Math.PI * dR * dR);
            }
            return area;

        case ApertureType.LITHO_OPC: {
             const cd = aperture.diameter || 1.0; 
             const srafW = aperture.slitWidth || cd*0.25;
             const h = cd * 5; 
             return (cd * h) + (2 * srafW * h); 
        }

        case ApertureType.FRACTAL:
            const initialArea = (aperture.spread || 10) ** 2;
            const iter = aperture.iteration || 3;
            return initialArea * Math.pow(8/9, iter);

        case ApertureType.SIERPINSKI_TRIANGLE:
             const s = aperture.spread || 5.0;
             const triArea = (Math.sqrt(3)/4) * s * s;
             return triArea * Math.pow(3/4, aperture.iteration || 3);
        
        case ApertureType.LISSAJOUS:
        case ApertureType.SPIRAL:
        case ApertureType.ROSETTE:
             // Approximation: Length * Thickness
             return (aperture.diameter * 3) * (aperture.slitWidth || 0.1); 

        default:
            return Math.PI * r * r;
    }
};

export const calculatePhysics = (camera: CameraConfig, aperture: ApertureConfig): SimulationResult => {
  const focalLength = Math.max(0.1, camera.focalLength);
  const wavelength = Math.max(380, camera.wavelength);
  const lambda = wavelength * PHYSICS_CONSTANTS.WAVELENGTH_TO_MM;

  let featureSize = aperture.diameter;
  
  if ([ApertureType.SLIT, ApertureType.CROSS, ApertureType.WAVES, ApertureType.SLIT_ARRAY, 
       ApertureType.LISSAJOUS, ApertureType.SPIRAL, ApertureType.ROSETTE].includes(aperture.type)) {
      featureSize = aperture.slitWidth || 0.1;
  } else if (aperture.type === ApertureType.LITHO_OPC) {
      featureSize = aperture.diameter || 0.1; 
  } else if (aperture.type === ApertureType.URA) {
      const rank = aperture.uraRank || 13;
      featureSize = aperture.diameter / rank; 
  }

  // Determine Max Footprint for Kernel Sizing
  let maxFootprint = aperture.diameter * 1.5;
  
  if ([ApertureType.FRACTAL, ApertureType.SIERPINSKI_TRIANGLE, ApertureType.MULTI_DOT, ApertureType.FIBONACCI].includes(aperture.type)) {
      maxFootprint = (aperture.spread || 10) * 1.2;
  } else if ([ApertureType.WAVES, ApertureType.YIN_YANG].includes(aperture.type)) {
      const amp = aperture.slitHeight || 2.0;
      const width = aperture.diameter || 10.0;
      maxFootprint = Math.max(width, amp) * 1.2;
  } else if (aperture.type === ApertureType.LITHO_OPC) {
      const cd = aperture.diameter || 1.0;
      maxFootprint = cd * 8; 
  } else if (aperture.type === ApertureType.URA) {
      maxFootprint = aperture.diameter * 1.2;
  } else if (aperture.type === ApertureType.SLIT_ARRAY) {
      const n = aperture.count || 2;
      const spacing = aperture.spread || 1.0;
      const w = aperture.slitWidth || 0.1;
      maxFootprint = (n * spacing + w) * 1.5;
  }

  let optimalDiameter = PHYSICS_CONSTANTS.RAYLEIGH_FACTOR * Math.sqrt(focalLength * lambda);
  
  if ([ApertureType.ZONE_PLATE, ApertureType.PHOTON_SIEVE].includes(aperture.type)) {
    const N = Math.max(1, aperture.zones || PHYSICS_CONSTANTS.DEFAULT_ZONES);
    optimalDiameter = 2 * Math.sqrt(N * focalLength * lambda);
  }

  const openAreaMm2 = calculateOpenArea(aperture);
  
  // F-Number Calculation Logic Update
  let effectiveDiameter: number;
  if ([ApertureType.SLIT, ApertureType.CROSS, ApertureType.SLIT_ARRAY, ApertureType.WAVES, 
       ApertureType.YIN_YANG, ApertureType.LISSAJOUS, ApertureType.SPIRAL, ApertureType.ROSETTE].includes(aperture.type)) {
      // For slits, the critical dimension for diffraction and DOF is the width
      effectiveDiameter = aperture.slitWidth || 0.1;
  } else if (aperture.type === ApertureType.LITHO_OPC) {
      effectiveDiameter = aperture.diameter || 0.1; 
  } else if (aperture.type === ApertureType.ANNULAR) {
      // For annular, the outer diameter defines the light cone angle
      effectiveDiameter = aperture.diameter;
  } else {
      // For general holes, use area-equivalent diameter
      effectiveDiameter = 2 * Math.sqrt(openAreaMm2 / Math.PI);
  }
  
  const fNumber = focalLength / effectiveDiameter;

  const geometricBlur = featureSize;
  const diffractionBlur = (PHYSICS_CONSTANTS.AIRY_DISK_FACTOR * lambda * focalLength) / featureSize;
  const totalBlur = Math.sqrt(Math.pow(geometricBlur, 2) + Math.pow(diffractionBlur, 2));

  const diagSensor = Math.sqrt(camera.sensorWidth**2 + camera.sensorHeight**2);
  const diag35 = 43.266;
  const cropFactor = diagSensor > 0 ? diag35 / diagSensor : 1;

  // Interference Calculations
  let fringeSpacing = 0;
  let interferenceRating = "";

  if (aperture.type === ApertureType.SLIT_ARRAY) {
      const d = aperture.spread || 1.0; // center-to-center spacing
      if (d > 0) {
          // Delta y = (lambda * D) / d
          fringeSpacing = (lambda * focalLength) / d; 
          
          if (fringeSpacing < 0.005) interferenceRating = "Microscopic (Invisible)";
          else if (fringeSpacing < 0.02) interferenceRating = "Very Weak";
          else if (fringeSpacing < 0.1) interferenceRating = "Visible (Fine)";
          else if (fringeSpacing < 1.0) interferenceRating = "Strong / Clear";
          else interferenceRating = "Very Wide";
      }
  }

  return {
    geometricBlur,
    diffractionBlur,
    totalBlur,
    optimalDiameter,
    fNumber, 
    fovH: 2 * Math.atan(camera.sensorWidth / (2 * focalLength)) * (180 / Math.PI),
    fovV: 2 * Math.atan(camera.sensorHeight / (2 * focalLength)) * (180 / Math.PI),
    focalLength35mm: focalLength * cropFactor,
    maxFootprint,
    isDiffractionLimited: diffractionBlur > geometricBlur,
    fringeSpacing,
    interferenceRating
  };
};

export const drawAperture = (
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  scale: number,
  aperture: ApertureConfig,
  wavelength: number,
  focalLength: number,
  maskBitmap?: ImageBitmap
) => {
  ctx.save();
  ctx.rotate((aperture.rotation || 0) * Math.PI / 180);
  const lambda = wavelength * PHYSICS_CONSTANTS.WAVELENGTH_TO_MM;
  const radiusPx = (aperture.diameter * scale) / 2;
  ctx.fillStyle = '#fff';

  let seed = aperture.seed || 12345;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };

  switch (aperture.type) {
    case ApertureType.PINHOLE:
      ctx.beginPath(); ctx.arc(0, 0, radiusPx, 0, Math.PI * 2); ctx.fill();
      break;
    
    case ApertureType.CUSTOM:
        if (!maskBitmap) {
            ctx.strokeStyle = '#333';
            ctx.strokeRect(-radiusPx, -radiusPx, radiusPx*2, radiusPx*2);
        }
        break;

    case ApertureType.URA:
        {
            const rank = aperture.uraRank || 13;
            const cellSize = (aperture.diameter * scale) / rank;
            const grid = generateURA(rank);
            const offset = (aperture.diameter * scale) / 2;
            
            for(let i=0; i<rank; i++) {
                for(let j=0; j<rank; j++) {
                    if (grid[i*rank + j] === 1) {
                        ctx.fillRect(j*cellSize - offset, i*cellSize - offset, cellSize, cellSize);
                    }
                }
            }
        }
        break;

    case ApertureType.ZONE_PLATE:
      const maxN = Math.floor(Math.pow(aperture.diameter/2, 2) / (lambda * focalLength));
      
      if (aperture.zonePlateProfile === 'SPIRAL') {
          // Spiral Zone Plate: Adds angular momentum
          const maxR = (aperture.diameter * scale) / 2;
          const stepSize = 0.5; 
          for(let r=0; r<maxR; r+=stepSize) {
               for(let theta=0; theta<Math.PI*2; theta+=0.05) {
                   const r_mm = r / scale;
                   // Phase = k*r^2/2f + l*theta
                   const phase = (Math.PI * r_mm * r_mm) / (lambda * focalLength) + theta;
                   const val = Math.cos(phase) > 0 ? 1 : 0;
                   if (val) {
                       ctx.fillStyle = '#fff';
                       ctx.fillRect(r*Math.cos(theta), r*Math.sin(theta), 1.5, 1.5);
                   }
               }
          }
      } 
      else if (aperture.zonePlateProfile === 'SINUSOIDAL') {
          const maxR = (aperture.diameter * scale) / 2;
          const stepSize = 0.5; // px
          for(let r=0; r<maxR; r+=stepSize) {
               const r_mm = r / scale;
               const phase = (Math.PI * r_mm * r_mm) / (lambda * focalLength);
               const transmission = (1 + Math.cos(phase)) / 2;
               
               ctx.beginPath();
               ctx.arc(0, 0, r, 0, Math.PI*2);
               ctx.strokeStyle = `rgba(255, 255, 255, ${transmission})`;
               ctx.lineWidth = stepSize + 0.1;
               ctx.stroke();
          }
      } else {
          for (let n = Math.max(1, maxN); n >= 1; n--) {
            const r_px = Math.sqrt(n * lambda * focalLength) * scale;
            ctx.beginPath(); ctx.arc(0, 0, r_px, 0, Math.PI * 2);
            ctx.fillStyle = n % 2 === 1 ? '#fff' : '#000';
            ctx.fill();
          }
      }
      break;

    case ApertureType.PHOTON_SIEVE:
       const sieveZones = aperture.zones || 15;
       const maxSieveR = aperture.diameter / 2;
       for (let n = 1; n <= sieveZones * 4; n++) {
           const r_center_mm = Math.sqrt((n + 0.5) * lambda * focalLength);
           const r_width_mm = Math.sqrt((n + 1) * lambda * focalLength) - Math.sqrt(n * lambda * focalLength);
           if (r_center_mm > maxSieveR) break;
           if (n % 2 === 0) continue;
           const hole_d = 1.53 * r_width_mm; 
           const hole_r_px = (hole_d * scale) / 2;
           if (hole_r_px < 0.2) continue; 
           const r_px = r_center_mm * scale;
           const circumference = 2 * Math.PI * r_center_mm;
           const numHoles = Math.floor((circumference / (hole_d * 1.5))); 
           for(let k=0; k<numHoles; k++) {
               const theta = (k / numHoles) * Math.PI * 2 + (random() * 0.5);
               ctx.beginPath(); ctx.arc(r_px * Math.cos(theta), r_px * Math.sin(theta), hole_r_px, 0, Math.PI*2); ctx.fill();
           }
       }
       break;

    case ApertureType.SLIT:
      const sw = (aperture.slitWidth || 0.2) * scale;
      const sh = (aperture.diameter || 5.0) * scale; 
      ctx.fillRect(-sh/2, -sw/2, sh, sw);
      break;

    case ApertureType.SLIT_ARRAY:
       {
           const n = Math.max(2, aperture.count || 2);
           const w = (aperture.slitWidth || 0.1) * scale;
           const h = (aperture.diameter || 5.0) * scale;
           const spacing = (aperture.spread || 0.5) * scale; 
           
           const totalWidth = (n - 1) * spacing;
           const startX = -totalWidth / 2;
           
           for(let i=0; i<n; i++) {
               ctx.fillRect(startX + i*spacing - w/2, -h/2, w, h);
           }
       }
       break;

    case ApertureType.CROSS:
      {
          const w = (aperture.slitWidth || 0.5) * scale;
          const len = (aperture.diameter) * scale; 
          ctx.fillRect(-w/2, -len/2, w, len);
          ctx.fillRect(-len/2, -w/2, len, w);
      }
      break;
    
    case ApertureType.ANNULAR:
      {
          const rOut = (aperture.diameter * scale) / 2;
          const id = aperture.innerDiameter !== undefined ? aperture.innerDiameter : aperture.diameter * 0.5;
          const rIn = (id * scale) / 2;
          ctx.beginPath(); 
          ctx.arc(0, 0, Math.max(0, rOut), 0, Math.PI*2); 
          ctx.arc(0, 0, Math.max(0, rIn), 0, Math.PI*2, true); 
          ctx.fill();
      }
      break;

    case ApertureType.WAVES:
    case ApertureType.YIN_YANG:
      {
          const width = (aperture.diameter || 10) * scale;
          const thickness = (aperture.slitWidth || 0.1) * scale;
          const amplitude = (aperture.slitHeight || 2.0) * scale;
          const waves = aperture.count || 1;
          
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.lineWidth = thickness;
          ctx.strokeStyle = '#fff';
          
          ctx.beginPath();
          const steps = 100 * waves;
          let first = true;
          for (let i=0; i<=steps; i++) {
              const xNorm = i/steps; 
              const x = (xNorm - 0.5) * width;
              const angle = xNorm * Math.PI * 2 * waves;
              const y = (amplitude/2) * Math.sin(angle);
              if (first) { ctx.moveTo(x,y); first=false; }
              else ctx.lineTo(x,y);
          }
          ctx.stroke();

          if (aperture.type === ApertureType.YIN_YANG) {
               const dotR = (aperture.innerDiameter || 0.2) * scale / 2;
               ctx.fillStyle = '#fff';
               for(let w=0; w<waves; w++) {
                   const peakXNorm = (w + 0.25) / waves;
                   const troughXNorm = (w + 0.75) / waves;
                   const px = (peakXNorm - 0.5) * width;
                   const tx = (troughXNorm - 0.5) * width;
                   ctx.beginPath(); ctx.arc(px, 0, dotR, 0, Math.PI*2); ctx.fill();
                   ctx.beginPath(); ctx.arc(tx, 0, dotR, 0, Math.PI*2); ctx.fill();
               }
          }
      }
      break;

    case ApertureType.LITHO_OPC:
        {
             const cd = (aperture.diameter || 1.0) * scale; 
             const height = cd * 5; 
             ctx.fillRect(-cd/2, -height/2, cd, height);
             const srafWidth = (aperture.slitWidth || cd*0.25) * scale;
             const srafDist = (aperture.spread || 1.0) * scale; 
             const leftX = -cd/2 - srafDist - srafWidth;
             const rightX = cd/2 + srafDist;
             ctx.fillRect(leftX, -height/2, srafWidth, height);
             ctx.fillRect(rightX, -height/2, srafWidth, height);
        }
        break;

    case ApertureType.MULTI_DOT:
        {
            const count = Math.max(1, aperture.count || 8);
            const spread = (aperture.spread || 2.0) * scale; 
            const dotR = (aperture.diameter || 0.2) * scale / 2;
            const pattern = aperture.multiDotPattern || MultiDotPattern.RING;
            
            if (aperture.centerDot) {
                ctx.beginPath(); ctx.arc(0, 0, dotR, 0, Math.PI*2); ctx.fill();
            }

            if (pattern === MultiDotPattern.RING) {
                for(let i=0; i<count; i++) {
                    const theta = (i/count) * Math.PI*2;
                    ctx.beginPath(); ctx.arc(spread*Math.cos(theta), spread*Math.sin(theta), dotR, 0, Math.PI*2); ctx.fill();
                }
            } else if (pattern === MultiDotPattern.GRID) {
                const side = Math.ceil(Math.sqrt(count));
                const spacing = spread * 2 / Math.max(1, side - 1);
                const start = -(side-1)*spacing/2;
                let drawn = 0;
                for(let r=0; r<side; r++) {
                    for(let c=0; c<side; c++) {
                        if(drawn >= count) break;
                        ctx.beginPath(); ctx.arc(start + c*spacing, start + r*spacing, dotR, 0, Math.PI*2); ctx.fill();
                        drawn++;
                    }
                }
            } else if (pattern === MultiDotPattern.CONCENTRIC) {
                const rings = 5;
                for(let r=1; r<=rings; r++) {
                     const rad = (r/rings) * spread;
                     const dotsInThisRing = Math.max(3, Math.floor(count * (r/((rings*(rings+1))/2)))); 
                     for(let k=0; k<dotsInThisRing; k++) {
                         const th = (k/dotsInThisRing) * Math.PI*2 + (r % 2) * (Math.PI/dotsInThisRing);
                         ctx.beginPath(); ctx.arc(rad*Math.cos(th), rad*Math.sin(th), dotR, 0, Math.PI*2); ctx.fill();
                     }
                }
            } else if (pattern === MultiDotPattern.RANDOM) {
                 for(let i=0; i<count; i++) {
                      const r = spread * Math.sqrt(random());
                      const th = 2 * Math.PI * random();
                      ctx.beginPath(); ctx.arc(r*Math.cos(th), r*Math.sin(th), dotR, 0, Math.PI*2); ctx.fill();
                 }
            } else if (pattern === MultiDotPattern.LINE) {
                 const step = (spread * 2) / Math.max(1, count - 1);
                 const start = -spread;
                 for(let i=0; i<count; i++) {
                     ctx.beginPath(); ctx.arc(start + i*step, 0, dotR, 0, Math.PI*2); ctx.fill();
                 }
            }
        }
        break;

    case ApertureType.FIBONACCI:
      const points = aperture.count || 50;
      const maxRad = (aperture.spread || 2.0) * scale;
      const fDotR = (aperture.diameter || 0.1) * scale / 2;
      const goldenAngle = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < points; i++) {
         const r = maxRad * Math.sqrt(i / points);
         const theta = i * goldenAngle;
         ctx.beginPath(); ctx.arc(r * Math.cos(theta), r * Math.sin(theta), fDotR, 0, Math.PI*2); ctx.fill();
      }
      break;
    
    case ApertureType.STAR:
        {
            const spikes = aperture.spikes || 5;
            const outerRadius = (aperture.diameter * scale) / 2;
            const irVal = aperture.innerDiameter !== undefined ? aperture.innerDiameter : aperture.diameter * 0.4;
            const innerRadius = (irVal * scale) / 2;
            let rot = Math.PI / 2 * 3;
            const step = Math.PI / spikes;
            ctx.beginPath();
            ctx.moveTo(0, -outerRadius); 
            for (let i = 0; i < spikes; i++) {
                ctx.lineTo(Math.cos(rot) * outerRadius, Math.sin(rot) * outerRadius);
                rot += step;
                ctx.lineTo(Math.cos(rot) * innerRadius, Math.sin(rot) * innerRadius);
                rot += step;
            }
            ctx.lineTo(0, -outerRadius);
            ctx.closePath();
            ctx.fill();
        }
        break;

    case ApertureType.FRACTAL:
        {
            const fSize = (aperture.spread || 10) * scale;
            const iter = Math.min(5, aperture.iteration || 3);
            const drawCarpet = (x: number, y: number, s: number, depth: number) => {
                if (depth === 0) {
                    ctx.fillRect(x - s/2, y - s/2, s, s);
                    return;
                }
                const newS = s / 3;
                if (newS < 0.5) { ctx.fillRect(x - s/2, y - s/2, s, s); return; }
                for (let dx = -1; dx <= 1; dx++) {
                    for (let dy = -1; dy <= 1; dy++) {
                        if (dx === 0 && dy === 0) continue; 
                        drawCarpet(x + dx * newS, y + dy * newS, newS, depth - 1);
                    }
                }
            };
            drawCarpet(0, 0, fSize, iter);
        }
        break;

    case ApertureType.SIERPINSKI_TRIANGLE:
         {
             const sTrSize = (aperture.spread || 5.0) * scale;
             const sTrIter = Math.min(6, aperture.iteration || 3);
             const R = sTrSize / Math.sqrt(3);
             const p1 = { x: 0, y: -R };
             const p2 = { x: sTrSize/2, y: R/2 };
             const p3 = { x: -sTrSize/2, y: R/2 };
             const drawTri = (v1: {x:number, y:number}, v2: {x:number, y:number}, v3: {x:number, y:number}, depth: number) => {
                 if (depth === 0) {
                     ctx.beginPath();
                     ctx.moveTo(v1.x, v1.y);
                     ctx.lineTo(v2.x, v2.y);
                     ctx.lineTo(v3.x, v3.y);
                     ctx.fill();
                     return;
                 }
                 const m12 = { x: (v1.x + v2.x)/2, y: (v1.y + v2.y)/2 };
                 const m23 = { x: (v2.x + v3.x)/2, y: (v2.y + v3.y)/2 };
                 const m31 = { x: (v3.x + v1.x)/2, y: (v3.y + v1.y)/2 };
                 const dist = Math.sqrt((v1.x-v2.x)**2 + (v1.y-v2.y)**2);
                 if (dist < 1) { 
                     ctx.beginPath();
                     ctx.moveTo(v1.x, v1.y);
                     ctx.lineTo(v2.x, v2.y);
                     ctx.lineTo(v3.x, v3.y);
                     ctx.fill();
                     return;
                 }
                 drawTri(v1, m12, m31, depth - 1);
                 drawTri(m12, v2, m23, depth - 1);
                 drawTri(m31, m23, v3, depth - 1);
             };
             drawTri(p1, p2, p3, sTrIter);
         }
         break;

    case ApertureType.LISSAJOUS:
         {
             const rx = aperture.lissajousRX || 3;
             const ry = aperture.lissajousRY || 2;
             const delta = (aperture.lissajousDelta || 0) * (Math.PI/180);
             const r = (aperture.diameter * scale) / 2;
             const thickness = (aperture.slitWidth || 0.1) * scale;
             
             ctx.lineCap = 'round';
             ctx.lineJoin = 'round';
             ctx.lineWidth = thickness;
             ctx.strokeStyle = '#fff';
             
             ctx.beginPath();
             const steps = 500;
             for(let i=0; i<=steps; i++) {
                 const t = (i/steps) * Math.PI * 2;
                 const x = r * Math.sin(rx * t + delta);
                 const y = r * Math.sin(ry * t);
                 if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
             }
             ctx.stroke();
         }
         break;

    case ApertureType.SPIRAL:
         {
             const arms = Math.max(1, aperture.spiralArms || 1);
             const turns = aperture.spiralTurns || 3;
             const maxR = (aperture.diameter * scale) / 2;
             const thickness = (aperture.slitWidth || 0.1) * scale;
             
             ctx.lineCap = 'round';
             ctx.lineJoin = 'round';
             ctx.lineWidth = thickness;
             ctx.strokeStyle = '#fff';
             
             const angleStep = (Math.PI*2) / arms;
             
             for(let a=0; a<arms; a++) {
                 const startAngle = a * angleStep;
                 ctx.beginPath();
                 const steps = 100 * turns;
                 for(let i=0; i<=steps; i++) {
                     const t = i/steps; // 0 to 1
                     const r = t * maxR;
                     const theta = startAngle + (t * Math.PI * 2 * turns);
                     const x = r * Math.cos(theta);
                     const y = r * Math.sin(theta);
                     if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
                 }
                 ctx.stroke();
             }
         }
         break;

    case ApertureType.ROSETTE:
         {
             const petals = aperture.rosettePetals || 5;
             const rBase = (aperture.diameter * scale) / 2;
             const amp = (aperture.slitHeight || rBase * 0.3) * scale; // Amplitude as 'slitHeight'
             const thickness = (aperture.slitWidth || 0.1) * scale;
             
             ctx.lineCap = 'round';
             ctx.lineJoin = 'round';
             ctx.lineWidth = thickness;
             ctx.strokeStyle = '#fff';
             
             ctx.beginPath();
             const steps = 360;
             for(let i=0; i<=steps; i++) {
                 const theta = (i/steps) * Math.PI * 2;
                 // r = R + A * cos(k*theta)
                 const r = rBase + amp * Math.cos(petals * theta);
                 const x = r * Math.cos(theta);
                 const y = r * Math.sin(theta);
                 if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
             }
             ctx.closePath();
             ctx.stroke();
         }
         break;
         
    case ApertureType.FREEFORM:
         if (aperture.customPath && aperture.customPath.length > 0) {
              const ffScale = (aperture.diameter || 10) * scale; 
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.lineWidth = (aperture.brushSize || 0.5) * scale;
              ctx.strokeStyle = '#fff';
              ctx.beginPath();
              let penDown = false;
              for(let i=0; i<aperture.customPath.length; i++) {
                  const p = aperture.customPath[i];
                  if (isNaN(p.x)) {
                      penDown = false;
                      ctx.stroke(); ctx.beginPath();
                      continue;
                  }
                  const px = p.x * (ffScale/2);
                  const py = p.y * (ffScale/2);
                  if (!penDown) { ctx.moveTo(px, py); penDown = true; } else { ctx.lineTo(px, py); }
              }
              ctx.stroke();
         }
         break;
         
    case ApertureType.RANDOM:
        const rCount = aperture.count || 50;
        const rSpread = (aperture.spread || aperture.diameter) * scale / 2;
        const rMinSize = (aperture.diameter || 0.1) * scale / 4;
        for(let i=0; i<rCount; i++) {
            const r = rSpread * Math.sqrt(random());
            const th = 2 * Math.PI * random();
            const s = rMinSize * (0.5 + 1.5*random());
            ctx.beginPath(); ctx.arc(r*Math.cos(th), r*Math.sin(th), s, 0, Math.PI*2); ctx.fill();
        }
        break;

    default:
      ctx.beginPath(); ctx.arc(0, 0, radiusPx, 0, Math.PI * 2); ctx.fill();
      break;
  }
  ctx.restore();
};

export const generateKernel = (camera: CameraConfig, aperture: ApertureConfig, wavelength: number, pixelsPerMm: number, maskBitmap?: ImageBitmap): Float32Array => {
    // Stub: Logic moved to worker for full image FFT.
    // This allows for future client-side light kernels if needed, but for now it's a placeholder.
    return new Float32Array(0); 
};
