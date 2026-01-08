

import { ApertureConfig, ApertureType, MultiDotPattern, CameraConfig, SimulationResult } from '../types';

export const DEFAULT_WAVELENGTH = 550;

export const PHYSICS_CONSTANTS = {
  WAVELENGTH_TO_MM: 1e-6,
  RAYLEIGH_FACTOR: 1.9,
  DEFAULT_ZONES: 10,
  MIN_DIAMETER_MM: 0.001,
  AIRY_DISK_FACTOR: 2.44,
  RGB_WAVELENGTHS: [640, 540, 460] // sRGB Primaries
};

class ComplexArray {
    n: number;
    real: Float32Array;
    imag: Float32Array;
    constructor(n: number) {
        this.n = n;
        this.real = new Float32Array(n);
        this.imag = new Float32Array(n);
    }
}

const FFT = {
    transform: (out: ComplexArray, inverse: boolean) => {
        const n = out.n;
        const bits = Math.log2(n);
        for (let i = 0; i < n; i++) {
            let rev = 0, val = i;
            for (let j = 0; j < bits; j++) { rev = (rev << 1) | (val & 1); val >>= 1; }
            if (rev > i) {
                const tr = out.real[i], ti = out.imag[i];
                out.real[i] = out.real[rev]; out.imag[i] = out.imag[rev];
                out.real[rev] = tr; out.imag[rev] = ti;
            }
        }
        for (let s = 1; s <= bits; s++) {
            const m = 1 << s, m2 = m >> 1;
            const theta = (inverse ? -2 : 2) * Math.PI / m;
            const wR_base = Math.cos(theta), wI_base = Math.sin(theta);
            for (let k = 0; k < n; k += m) {
                let wR = 1, wI = 0;
                for (let j = 0; j < m2; j++) {
                    const idx = k + j + m2;
                    const tR = wR * out.real[idx] - wI * out.imag[idx];
                    const tI = wR * out.imag[idx] + wI * out.real[idx];
                    const uR = out.real[k+j], uI = out.imag[k+j];
                    out.real[k+j] = uR + tR; out.imag[k+j] = uI + tI;
                    out.real[idx] = uR - tR; out.imag[idx] = uI - tI;
                    const nextWR = wR * wR_base - wI * wI_base;
                    wI = wR * wI_base + wI * wR_base; wR = nextWR;
                }
            }
        }
        if (inverse) {
            for(let i=0; i<n; i++) { out.real[i] /= n; out.imag[i] /= n; }
        }
    },
    fft2D: (cArr: ComplexArray, w: number, h: number, inverse: boolean) => {
        for(let y=0; y<h; y++) {
            const row = new ComplexArray(w);
            const off = y*w;
            for(let x=0; x<w; x++) { row.real[x] = cArr.real[off+x]; row.imag[x] = cArr.imag[off+x]; }
            FFT.transform(row, inverse);
            for(let x=0; x<w; x++) { cArr.real[off+x] = row.real[x]; cArr.imag[off+x] = row.imag[x]; }
        }
        for(let x=0; x<w; x++) {
            const col = new ComplexArray(h);
            for(let y=0; y<h; y++) { col.real[y] = cArr.real[y*w+x]; col.imag[y] = cArr.imag[y*w+x]; }
            FFT.transform(col, inverse);
            for(let y=0; y<h; y++) { cArr.real[y*w+x] = col.real[y]; cArr.imag[y*w+x] = col.imag[y]; }
        }
    },
    fftShift: (cArr: ComplexArray, w: number, h: number) => {
        const halfW = Math.floor(w/2);
        const halfH = Math.floor(h/2);
        const tempR = new Float32Array(w*h), tempI = new Float32Array(w*h);
        for(let y=0; y<h; y++) {
            for(let x=0; x<w; x++) {
                const newX = (x + halfW) % w, newY = (y + halfH) % h;
                const iOld = y*w + x, iNew = newY*w + newX;
                tempR[iNew] = cArr.real[iOld]; tempI[iNew] = cArr.imag[iOld];
            }
        }
        cArr.real.set(tempR); cArr.imag.set(tempI);
    }
};

const createCanvas = (w: number, h: number): OffscreenCanvas | HTMLCanvasElement => {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    return canvas;
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

        default:
            return Math.PI * r * r;
    }
};

export const calculatePhysics = (camera: CameraConfig, aperture: ApertureConfig): SimulationResult => {
  const focalLength = Math.max(0.1, camera.focalLength);
  const wavelength = Math.max(380, camera.wavelength);
  const lambda = wavelength * PHYSICS_CONSTANTS.WAVELENGTH_TO_MM;

  let featureSize = aperture.diameter;
  
  if (aperture.type === ApertureType.SLIT || aperture.type === ApertureType.CROSS || aperture.type === ApertureType.WAVES || aperture.type === ApertureType.SLIT_ARRAY) {
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
  const effectiveClearDiameter = 2 * Math.sqrt(openAreaMm2 / Math.PI);
  const fNumber = focalLength / effectiveClearDiameter;

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
      
      if (aperture.zonePlateProfile === 'SINUSOIDAL') {
          // Approximate Newton's Rings / Sinusoidal Zone Plate
          // Instead of drawing binary rings, we need to draw a gradient.
          // Since we are in a 2D canvas context usually expecting binary masks for simple FFT,
          // we simulate this by drawing many thin rings with varying opacity.
          const maxR = (aperture.diameter * scale) / 2;
          // Create radial gradient-like effect
          // Intensity I(r) = 0.5 * (1 + cos(k * r^2))
          // We can't do per-pixel efficiently here in path mode, so we draw fine rings.
          const stepSize = 0.5; // px
          for(let r=0; r<maxR; r+=stepSize) {
               const r_mm = r / scale;
               // Phase = (pi * r^2) / (lambda * f)
               const phase = (Math.PI * r_mm * r_mm) / (lambda * focalLength);
               // Sinusoidal transmission: (1 + cos(phase)) / 2
               const transmission = (1 + Math.cos(phase)) / 2;
               
               ctx.beginPath();
               ctx.arc(0, 0, r, 0, Math.PI*2);
               ctx.strokeStyle = `rgba(255, 255, 255, ${transmission})`;
               ctx.lineWidth = stepSize + 0.1;
               ctx.stroke();
          }
      } else {
          // Standard Binary Zone Plate
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
           // Young's Double Slit / Diffraction Grating
           const n = Math.max(2, aperture.count || 2);
           const w = (aperture.slitWidth || 0.1) * scale;
           const h = (aperture.diameter || 5.0) * scale;
           const spacing = (aperture.spread || 0.5) * scale; // Center to Center
           
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
    const lambdaMm = wavelength * PHYSICS_CONSTANTS.WAVELENGTH_TO_MM;
    const z = camera.focalLength;
    const d = aperture.diameter; 
    
    // Determine Simulation Window
    const diffractiveSize = (40 * lambdaMm * z) / (d || 0.1); 
    const geometricSize = (aperture.diameter || 1.0) * 1.5;
    
    // For Slit Arrays, calculating geometric size needs care
    let effectiveGeo = geometricSize;
    if (aperture.type === ApertureType.SLIT_ARRAY) {
       effectiveGeo = ((aperture.count || 2) * (aperture.spread || 1.0)) * 1.5;
    }

    const physSize = Math.max(effectiveGeo, diffractiveSize); 
    
    // Resolution
    let N = 256; 
    const reqRes = physSize * pixelsPerMm;
    if (reqRes > 256) N = 512;
    if (reqRes > 512) N = 1024;
    // Cap at 2048 for GPU memory safety, but allow 1024 for sharp lines
    if (reqRes > 1024) N = 2048; 
    
    // 1. Draw Aperture
    const canvas = createCanvas(N, N);
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,N,N);
    const simPixelsPerMm = N / physSize;
    ctx.translate(N/2, N/2);
    
    drawAperture(ctx, simPixelsPerMm, aperture, wavelength, z, maskBitmap);
    
    ctx.translate(-N/2, -N/2);
    const imgData = ctx.getImageData(0,0,N,N).data;
    
    // 2. Init Field
    const field = new ComplexArray(N*N);
    for(let i=0; i<N*N; i++) {
        const val = imgData[i*4] / 255.0;
        field.real[i] = val; 
    }

    if (!aperture.renderDiffraction) {
         const output = new Float32Array(N*N);
         let sum = 0;
         for(let i=0; i<N*N; i++) {
             const val = imgData[i*4] / 255.0;
             output[i] = val;
             sum += val;
         }
         if (sum > 0) for(let i=0; i<N*N; i++) output[i] /= sum;
         return output;
    }

    // 3. FFT -> Transfer Function -> IFFT
    FFT.fft2D(field, N, N, false);
    FFT.fftShift(field, N, N); 

    const dk = 1.0 / physSize; 
    const k = 2 * Math.PI / lambdaMm;
    
    for(let y=0; y<N; y++) {
        const fy = (y - N/2) * dk;
        for(let x=0; x<N; x++) {
            const fx = (x - N/2) * dk;
            const idx = y*N + x;
            const val = 1.0 - (lambdaMm*fx)**2 - (lambdaMm*fy)**2;
            
            if (val >= 0) {
                const phase = k * z * Math.sqrt(val);
                const cosP = Math.cos(phase);
                const sinP = Math.sin(phase);
                const r = field.real[idx], i = field.imag[idx];
                field.real[idx] = r*cosP - i*sinP;
                field.imag[idx] = r*sinP + i*cosP;
            } else {
                const decay = k * z * Math.sqrt(-val);
                const ev = Math.exp(-decay);
                field.real[idx] *= ev;
                field.imag[idx] *= ev;
            }
        }
    }

    FFT.fftShift(field, N, N); 
    FFT.fft2D(field, N, N, true);
    
    const output = new Float32Array(N*N);
    let sum = 0;
    for(let i=0; i<N*N; i++) {
        const magSq = field.real[i]**2 + field.imag[i]**2;
        output[i] = magSq;
        sum += magSq;
    }
    
    if (sum > 0) {
        for(let i=0; i<N*N; i++) output[i] /= sum;
    }
    
    return output;
};
