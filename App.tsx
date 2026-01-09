
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ControlPanel from './components/ControlPanel';
import Viewport from './components/Viewport';
import { CameraConfig, ApertureConfig, ApertureType, SimulationResult } from './types';
import { calculatePhysics, DEFAULT_WAVELENGTH } from './utils/physics';
import { generateLightSourceImage } from './utils/imageProcessing';

// --- EMBEDDED WORKER CODE: CPU FFT CONVOLUTION ENGINE ---
const WORKER_CODE = `
// --- CONSTANTS ---
const ApertureType = {
  PINHOLE: 'PINHOLE', ZONE_PLATE: 'ZONE_PLATE', PHOTON_SIEVE: 'PHOTON_SIEVE',
  SLIT: 'SLIT', CROSS: 'CROSS', SLIT_ARRAY: 'SLIT_ARRAY', RANDOM: 'RANDOM', ANNULAR: 'ANNULAR',
  MULTI_DOT: 'MULTI_DOT', STAR: 'STAR', WAVES: 'WAVES', YIN_YANG: 'YIN_YANG',
  URA: 'URA', FREEFORM: 'FREEFORM', FIBONACCI: 'FIBONACCI', FRACTAL: 'FRACTAL',
  SIERPINSKI_TRIANGLE: 'SIERPINSKI_TRIANGLE', LITHO_OPC: 'LITHO_OPC', 
  LISSAJOUS: 'LISSAJOUS', SPIRAL: 'SPIRAL', ROSETTE: 'ROSETTE', CUSTOM: 'CUSTOM'
};

const MultiDotPattern = {
  RING: 'RING', LINE: 'LINE', GRID: 'GRID', RANDOM: 'RANDOM', CONCENTRIC: 'CONCENTRIC'
};

const PHYSICS_CONSTANTS = {
  WAVELENGTH_TO_MM: 1e-6,
  RGB_WAVELENGTHS: [640, 540, 460] 
};

// --- FFT LIBRARY (Optimized JS CPU) ---
class ComplexArray {
    constructor(n) {
        this.n = n;
        this.real = new Float32Array(n);
        this.imag = new Float32Array(n);
    }
}

const FFT = {
    // Radix-2 Cooley-Tukey FFT
    transform: (out, inverse) => {
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
    fft2D: (cArr, w, h, inverse) => {
        // Rows
        for(let y=0; y<h; y++) {
            const row = new ComplexArray(w);
            const off = y*w;
            for(let x=0; x<w; x++) { row.real[x] = cArr.real[off+x]; row.imag[x] = cArr.imag[off+x]; }
            FFT.transform(row, inverse);
            for(let x=0; x<w; x++) { cArr.real[off+x] = row.real[x]; cArr.imag[off+x] = row.imag[x]; }
        }
        // Cols
        for(let x=0; x<w; x++) {
            const col = new ComplexArray(h);
            for(let y=0; y<h; y++) { col.real[y] = cArr.real[y*w+x]; col.imag[y] = cArr.imag[y*w+x]; }
            FFT.transform(col, inverse);
            for(let y=0; y<h; y++) { cArr.real[y*w+x] = col.real[y]; cArr.imag[y*w+x] = col.imag[y]; }
        }
    },
    fftShift: (cArr, w, h) => {
        const halfW = w >>> 1;
        const halfH = h >>> 1;
        const tempR = new Float32Array(w*h);
        const tempI = new Float32Array(w*h);
        for(let y=0; y<h; y++) {
            for(let x=0; x<w; x++) {
                const newX = (x + halfW) % w;
                const newY = (y + halfH) % h;
                const iOld = y*w + x;
                const iNew = newY*w + newX;
                tempR[iNew] = cArr.real[iOld];
                tempI[iNew] = cArr.imag[iOld];
            }
        }
        cArr.real.set(tempR);
        cArr.imag.set(tempI);
    }
};

const generateURA = (rank) => {
    const p = rank;
    const grid = new Int8Array(p * p);
    
    const isQuadraticResidue = (n, m) => {
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

// --- DRAWING UTILS ---
const drawAperture = (ctx, scale, aperture, maskBitmap, isSimulation, wavelength, focalLength) => {
  ctx.save();
  ctx.rotate((aperture.rotation || 0) * Math.PI / 180);
  const lambda = wavelength * PHYSICS_CONSTANTS.WAVELENGTH_TO_MM;
  const radiusPx = (aperture.diameter * scale) / 2;
  ctx.fillStyle = '#fff';
  
  // Anti-aliasing guard: Ensure lines are at least 1px wide for simulation
  const minSize = isSimulation ? 1.0 : 0; 
  
  let seed = aperture.seed || 12345;
  const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

  switch(aperture.type) {
    case ApertureType.PINHOLE: 
        const r = Math.max(minSize, radiusPx);
        ctx.beginPath(); ctx.arc(0,0, r, 0,Math.PI*2); ctx.fill(); 
        break;

    case ApertureType.CUSTOM:
        if(maskBitmap) { 
            const d = aperture.diameter*scale; 
            ctx.drawImage(maskBitmap, -d/2, -d/2, d, d); 
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
        {
          const maxN = Math.floor(Math.pow(aperture.diameter/2, 2) / (lambda * focalLength));
          const maxR = (aperture.diameter * scale) / 2;

          if (aperture.zonePlateProfile === 'SPIRAL') {
              const stepSize = 0.5; 
              for(let r=0; r<maxR; r+=stepSize) {
                   const circumference = 2 * Math.PI * r;
                   const dTheta = 1.0 / Math.max(1, circumference); 
                   
                   for(let theta=0; theta<Math.PI*2; theta+=dTheta) {
                       const r_mm = r / scale;
                       // Simplified Spiral Logic for Intensity Mask
                       const phase = (Math.PI * r_mm * r_mm) / (lambda * focalLength) + theta;
                       if (Math.cos(phase) > 0) {
                            ctx.fillRect(r*Math.cos(theta), r*Math.sin(theta), 1.5, 1.5);
                       }
                   }
              }
          } 
          else if (aperture.zonePlateProfile === 'SINUSOIDAL') {
              const stepSize = 0.5; // px
              for(let r=0; r<maxR; r+=stepSize) {
                   const r_mm = r / scale;
                   const phase = (Math.PI * r_mm * r_mm) / (lambda * focalLength);
                   const transmission = (1 + Math.cos(phase)) / 2;
                   
                   ctx.beginPath();
                   ctx.arc(0, 0, r, 0, Math.PI*2);
                   ctx.strokeStyle = "rgba(255, 255, 255, " + transmission + ")";
                   ctx.lineWidth = stepSize + 0.1;
                   ctx.stroke();
              }
          } else {
              // Binary
              for (let n = Math.max(1, maxN); n >= 1; n--) {
                const r_px = Math.sqrt(n * lambda * focalLength) * scale;
                ctx.beginPath(); ctx.arc(0, 0, r_px, 0, Math.PI * 2);
                ctx.fillStyle = n % 2 === 1 ? '#fff' : '#000';
                ctx.fill();
              }
          }
        }
        break;

    case ApertureType.PHOTON_SIEVE:
        {
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
        }
        break;

    case ApertureType.SLIT_ARRAY:
        {
           const n = Math.max(2, aperture.count || 2);
           const w = Math.max(minSize, (aperture.slitWidth || 0.1) * scale);
           const h = (aperture.diameter || 5.0) * scale;
           const spacing = (aperture.spread || 0.5) * scale; 
           const totalWidth = (n - 1) * spacing;
           const startX = -totalWidth / 2;
           for(let i=0; i<n; i++) {
               ctx.fillRect(startX + i*spacing - w/2, -h/2, w, h);
           }
        }
        break;

    case ApertureType.SLIT:
        {
            const w = Math.max(minSize, (aperture.slitWidth || 0.2) * scale);
            const h = (aperture.diameter || 5.0) * scale;
            ctx.fillRect(-h/2, -w/2, h, w);
        }
        break;

    case ApertureType.CROSS:
        {
            const w = Math.max(minSize, (aperture.slitWidth || 0.5) * scale);
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

    case ApertureType.WAVES: 
    case ApertureType.YIN_YANG:
        {
            const width = (aperture.diameter || 10) * scale;
            const thickness = Math.max(minSize, (aperture.slitWidth || 0.1) * scale);
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
                    ctx.beginPath(); ctx.arc(px, 0, Math.max(minSize/2, dotR), 0, Math.PI*2); ctx.fill();
                    ctx.beginPath(); ctx.arc(tx, 0, Math.max(minSize/2, dotR), 0, Math.PI*2); ctx.fill();
                }
            }
        }
        break;

    case ApertureType.MULTI_DOT:
    case ApertureType.FIBONACCI: 
    case ApertureType.RANDOM:
        {
            const count = Math.max(1, aperture.count || 8);
            const spread = (aperture.spread || 2.0) * scale; 
            const dotR = (aperture.diameter || 0.2) * scale / 2;
            const pattern = aperture.multiDotPattern || MultiDotPattern.RING;
            
            if (aperture.centerDot) {
                ctx.beginPath(); ctx.arc(0, 0, dotR, 0, Math.PI*2); ctx.fill();
            }

            if (aperture.type === ApertureType.FIBONACCI) {
                 const points = aperture.count || 50;
                 const maxRad = (aperture.spread || 2.0) * scale;
                 const fDotR = (aperture.diameter || 0.1) * scale / 2;
                 const goldenAngle = Math.PI * (3 - Math.sqrt(5));
                 for (let i = 0; i < points; i++) {
                    const r = maxRad * Math.sqrt(i / points);
                    const theta = i * goldenAngle;
                    ctx.beginPath(); ctx.arc(r * Math.cos(theta), r * Math.sin(theta), fDotR, 0, Math.PI*2); ctx.fill();
                 }
            } else if (aperture.type === ApertureType.RANDOM || pattern === MultiDotPattern.RANDOM) {
                 for(let i=0; i<count; i++) {
                      const r = spread * Math.sqrt(random());
                      const th = 2 * Math.PI * random();
                      const s = aperture.type === ApertureType.RANDOM ? dotR * (0.5 + 1.5*random()) : dotR; 
                      ctx.beginPath(); ctx.arc(r*Math.cos(th), r*Math.sin(th), s, 0, Math.PI*2); ctx.fill();
                 }
            } else if (pattern === MultiDotPattern.RING) {
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
            } else if (pattern === MultiDotPattern.LINE) {
                 const step = (spread * 2) / Math.max(1, count - 1);
                 const start = -spread;
                 for(let i=0; i<count; i++) {
                     ctx.beginPath(); ctx.arc(start + i*step, 0, dotR, 0, Math.PI*2); ctx.fill();
                 }
            }
        }
        break;

    case ApertureType.FRACTAL:
        {
            const fSize = (aperture.spread || 10) * scale;
            const iter = Math.min(5, aperture.iteration || 3);
            const drawCarpet = (x, y, s, depth) => {
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
             const drawTri = (v1, v2, v3, depth) => {
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

    case ApertureType.LISSAJOUS:
         {
             const rx = aperture.lissajousRX || 3;
             const ry = aperture.lissajousRY || 2;
             const delta = (aperture.lissajousDelta || 0) * (Math.PI/180);
             const r = (aperture.diameter * scale) / 2;
             const thickness = Math.max(minSize, (aperture.slitWidth || 0.1) * scale);
             
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
             const thickness = Math.max(minSize, (aperture.slitWidth || 0.1) * scale);
             
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
             const amp = (aperture.slitHeight || rBase * 0.3) * scale;
             const thickness = Math.max(minSize, (aperture.slitWidth || 0.1) * scale);
             
             ctx.lineCap = 'round';
             ctx.lineJoin = 'round';
             ctx.lineWidth = thickness;
             ctx.strokeStyle = '#fff';
             
             ctx.beginPath();
             const steps = 360;
             for(let i=0; i<=steps; i++) {
                 const theta = (i/steps) * Math.PI * 2;
                 const r = rBase + amp * Math.cos(petals * theta);
                 const x = r * Math.cos(theta);
                 const y = r * Math.sin(theta);
                 if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
             }
             ctx.closePath();
             ctx.stroke();
         }
         break;

    default:
      const radius = Math.max(minSize, radiusPx);
      ctx.beginPath(); ctx.arc(0,0, radius, 0, Math.PI * 2); ctx.fill();
      break;
  }
  ctx.restore();
};

// --- MAIN WORKER LOGIC ---
self.onmessage = async (e) => {
  const { camera, aperture, imageData, exposure, maskBitmap } = e.data;
  
  try {
      // 1. Resize Image to Power of 2 (1024) for efficient FFT
      const N = 1024; 
      const tempC = new OffscreenCanvas(N, N);
      const tempCtx = tempC.getContext('2d');
      
      // Black background
      tempCtx.fillStyle = '#000'; 
      tempCtx.fillRect(0,0,N,N);
      
      // Draw Input Image Scaled
      const bmp = await createImageBitmap(imageData);
      // Center crop or fit? Fit is better for simulation context
      const scale = Math.min(N/bmp.width, N/bmp.height);
      const drawW = bmp.width * scale;
      const drawH = bmp.height * scale;
      const offX = (N - drawW)/2;
      const offY = (N - drawH)/2;
      tempCtx.drawImage(bmp, offX, offY, drawW, drawH);
      bmp.close();
      
      const srcData = tempCtx.getImageData(0,0,N,N).data;
      
      // 2. Prepare Frequency Domain Accumulators
      const resultR = new Float32Array(N*N);
      const resultG = new Float32Array(N*N);
      const resultB = new Float32Array(N*N);
      
      const wavelengths = aperture.usePolychromatic ? PHYSICS_CONSTANTS.RGB_WAVELENGTHS : [camera.wavelength, camera.wavelength, camera.wavelength];
      
      // Pixels Per Millimeter on the simulation grid
      // Sensor covers 1024 pixels. 
      const pixelsPerMm = N / Math.max(camera.sensorWidth, camera.sensorHeight);

      // 3. Process each channel
      const channels = ['r', 'g', 'b'];
      
      for(let c=0; c<3; c++) {
          const wl = wavelengths[c];
          const lambdaMm = wl * 1e-6;
          
          // --- A. Generate PSF (Point Spread Function) ---
          // Draw Aperture
          tempCtx.fillStyle = '#000'; tempCtx.fillRect(0,0,N,N);
          tempCtx.translate(N/2, N/2);
          drawAperture(tempCtx, pixelsPerMm, aperture, maskBitmap, true, wl, camera.focalLength);
          tempCtx.translate(-N/2, -N/2);
          const apData = tempCtx.getImageData(0,0,N,N).data;
          
          // Field Complex Array
          const field = new ComplexArray(N*N);
          for(let i=0; i<N*N; i++) field.real[i] = apData[i*4]/255.0; // Red channel is enough for mask
          
          if (aperture.renderDiffraction) {
             // Shift Center
             FFT.fftShift(field, N, N);
             // FFT -> Freq Domain
             FFT.fft2D(field, N, N, false);
             
             // Angular Spectrum Propagation
             const z = camera.focalLength;
             const dk = 1.0 / (N/pixelsPerMm); // 1 / physical_size
             const k = 2 * Math.PI / lambdaMm;
             
             for(let y=0; y<N; y++) {
                const fy = (y - N/2) * dk;
                const fysq = fy*fy;
                for(let x=0; x<N; x++) {
                    const fx = (x - N/2) * dk;
                    const idx = y*N + x;
                    const val = 1.0 - (lambdaMm*fx)**2 - (lambdaMm*fy)**2;
                    
                    if (val >= 0) {
                        const phase = k * z * Math.sqrt(val);
                        const cosP = Math.cos(phase);
                        const sinP = Math.sin(phase);
                        const r = field.real[idx]; 
                        const i = field.imag[idx];
                        // Multiply by exp(i * phase)
                        field.real[idx] = r*cosP - i*sinP;
                        field.imag[idx] = r*sinP + i*cosP;
                    } else {
                         // Evanescent
                         field.real[idx] = 0; field.imag[idx] = 0;
                    }
                }
             }
             // IFFT -> Spatial Domain Field at Sensor
             FFT.fft2D(field, N, N, true);
             FFT.fftShift(field, N, N);
          }
          
          // Compute PSF (Intensity = MagSq)
          const psf = new ComplexArray(N*N); // Complex for FFT later
          let totalEnergy = 0;
          for(let i=0; i<N*N; i++) {
              const magSq = field.real[i]**2 + field.imag[i]**2;
              psf.real[i] = magSq;
              psf.imag[i] = 0;
              totalEnergy += magSq;
          }
          
          // Normalize PSF (Auto-Exposure: Total energy = 1)
          if(totalEnergy > 0) {
              const inv = 1.0 / totalEnergy;
              for(let i=0; i<N*N; i++) psf.real[i] *= inv;
          } else {
              // Fallback for empty aperture
              psf.real[N/2 * N + N/2] = 1.0; 
          }
          
          // --- B. Prepare Image Channel ---
          const imgC = new ComplexArray(N*N);
          const offset = (c === 0 ? 0 : c === 1 ? 1 : 2);
          for(let i=0; i<N*N; i++) {
               // sRGB -> Linear
               const sVal = srcData[i*4 + offset] / 255.0;
               imgC.real[i] = Math.pow(sVal, 2.2); 
               imgC.imag[i] = 0;
          }
          
          // --- C. FFT Convolution ---
          // FFT(PSF) -> OTF
          FFT.fftShift(psf, N, N); // Center peak at 0,0 for convolution
          FFT.fft2D(psf, N, N, false);
          
          // FFT(Image)
          FFT.fft2D(imgC, N, N, false);
          
          // Multiply: Img * OTF
          for(let i=0; i<N*N; i++) {
              const r1 = imgC.real[i], i1 = imgC.imag[i];
              const r2 = psf.real[i], i2 = psf.imag[i];
              imgC.real[i] = r1*r2 - i1*i2;
              imgC.imag[i] = r1*i2 + i1*r2;
          }
          
          // IFFT -> Result
          FFT.fft2D(imgC, N, N, true);
          // Result is in imgC.real
          
          if (c===0) for(let i=0; i<N*N; i++) resultR[i] = imgC.real[i];
          if (c===1) for(let i=0; i<N*N; i++) resultG[i] = imgC.real[i];
          if (c===2) for(let i=0; i<N*N; i++) resultB[i] = imgC.real[i];
      }

      // 4. Tone Mapping & Output
      const output = new Uint8ClampedArray(N*N*4);
      
      // ACES Tone Map Helper
      const aces = (x) => {
          const a = 2.51, b = 0.03, c = 2.43, d = 0.59, e = 0.14;
          return (x*(a*x+b))/(x*(c*x+d)+e);
      };

      for(let i=0; i<N*N; i++) {
          let r = resultR[i] * exposure;
          let g = resultG[i] * exposure;
          let b = resultB[i] * exposure;
          
          // Tone Map
          r = aces(r); g = aces(g); b = aces(b);
          
          // Linear -> sRGB (Gamma 2.2)
          r = Math.pow(Math.max(0, Math.min(1, r)), 1.0/2.2);
          g = Math.pow(Math.max(0, Math.min(1, g)), 1.0/2.2);
          b = Math.pow(Math.max(0, Math.min(1, b)), 1.0/2.2);
          
          output[i*4] = r * 255;
          output[i*4+1] = g * 255;
          output[i*4+2] = b * 255;
          output[i*4+3] = 255;
      }
      
      const resultBitmap = await createImageBitmap(new ImageData(output, N, N));
      self.postMessage({ success: true, processed: resultBitmap }, [resultBitmap]);
      
  } catch (err) {
    console.error(err);
    self.postMessage({ success: false, error: err.toString() });
  } finally {
      if (maskBitmap) maskBitmap.close();
  }
};
`;

const App: React.FC = () => {
  const [camera, setCamera] = useState<CameraConfig>({
    focalLength: 50,
    sensorWidth: 35.9,
    sensorHeight: 23.9,
    wavelength: DEFAULT_WAVELENGTH,
    iso: 100,
    modelName: 'nikon_z',
    flangeDistance: 16
  });

  const [aperture, setAperture] = useState<ApertureConfig>({
    type: ApertureType.PINHOLE,
    diameter: 0.3,
    usePolychromatic: true,
    useVignetting: true,
    rotation: 0,
    renderDiffraction: true, 
  });

  const [simResult, setSimResult] = useState<SimulationResult>(calculatePhysics(camera, aperture));
  const [uploadedImage, setUploadedImage] = useState<ImageData | null>(null);
  const [processedImage, setProcessedImage] = useState<ImageData | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [exposure, setExposure] = useState(1.0);

  // Use refs to track worker and its URL to properly revoke on cleanup
  const workerRef = useRef<Worker | null>(null);
  const workerUrlRef = useRef<string | null>(null);

  const createWorker = () => {
      const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
      const url = URL.createObjectURL(blob);
      const worker = new Worker(url);
      
      worker.onmessage = (e) => {
        if (e.data.success) {
          const bitmap = e.data.processed;
          const canvas = document.createElement('canvas');
          canvas.width = bitmap.width;
          canvas.height = bitmap.height;
          const ctx = canvas.getContext('2d');
          ctx?.drawImage(bitmap, 0, 0);
          setProcessedImage(ctx?.getImageData(0,0,canvas.width,canvas.height) || null);
        } else {
          console.error("Simulation Worker Error:", e.data.error);
        }
        setIsProcessing(false);
      };

      worker.onerror = (error) => {
        console.error("Worker lifecycle error:", error);
        setIsProcessing(false);
      };
      
      return { worker, url };
  };

  // Initial Worker Setup
  useEffect(() => {
    const { worker, url } = createWorker();
    workerRef.current = worker;
    workerUrlRef.current = url;

    return () => {
        worker.terminate();
        if (workerUrlRef.current) URL.revokeObjectURL(workerUrlRef.current);
    };
  }, []);

  const terminateWorker = () => {
      if (workerRef.current) {
          workerRef.current.onmessage = null; // Prevent race condition
          workerRef.current.terminate();
      }
      if (workerUrlRef.current) {
          URL.revokeObjectURL(workerUrlRef.current);
          workerUrlRef.current = null;
      }
      setIsProcessing(false);
      
      // Delay recreation to ensure clean state
      setTimeout(() => {
          const { worker, url } = createWorker();
          workerRef.current = worker;
          workerUrlRef.current = url;
      }, 50);
  };

  useEffect(() => {
    setSimResult(calculatePhysics(camera, aperture));
  }, [camera, aperture]);

  const runSimulation = useCallback(async () => {
    if (!workerRef.current) return;
    setIsProcessing(true);

    let input = uploadedImage;
    let effectiveExposure = exposure; 

    // Auto Exposure Logic
    if (input) {
        // Normal Mode: Input is scene.
        // FFT Convolution with normalized PSF is energy conserving.
        // We do NOT add arbitrary gain here, as it leads to overexposure.
        effectiveExposure = exposure; 
    } else {
        // Point Source Mode: Generate synthetic source
        // Needs massive boost to see diffraction rings because the source is microscopic
        input = generateLightSourceImage(1024, 1024, 0.1, camera.sensorWidth);
        effectiveExposure = exposure * 5000.0; 
    }

    let maskBitmap: ImageBitmap | undefined = undefined;

    if (aperture.type === ApertureType.CUSTOM && aperture.maskImage) {
        try {
            const img = new Image();
            img.src = aperture.maskImage;
            await new Promise((resolve) => img.onload = resolve);
            const offC = document.createElement('canvas');
            offC.width = img.width; offC.height = img.height;
            const ctx = offC.getContext('2d');
            if (ctx) {
                ctx.drawImage(img, 0, 0);
                const idata = ctx.getImageData(0,0,img.width,img.height);
                const data = idata.data;
                const thresh = aperture.maskThreshold ?? 128;
                const invert = aperture.maskInvert || false;
                for(let i=0; i<data.length; i+=4) {
                    const avg = (data[i] + data[i+1] + data[i+2])/3;
                    let val = avg > thresh ? 255 : 0;
                    if(invert) val = 255 - val;
                    data[i] = val; data[i+1] = val; data[i+2] = val; data[i+3] = 255;
                }
                ctx.putImageData(idata, 0, 0);
                maskBitmap = await createImageBitmap(offC);
            }
        } catch (e) { console.error("Failed to process mask image", e); }
    }

    workerRef.current.postMessage(
        { camera, aperture, imageData: input, exposure: effectiveExposure, maskBitmap }, 
        maskBitmap ? [maskBitmap] : []
    );
  }, [camera, aperture, uploadedImage, exposure]);

  const handleUpload = (file: File) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1600 / img.width, 1600 / img.height, 1);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      setUploadedImage(ctx.getImageData(0, 0, canvas.width, canvas.height));
      setProcessedImage(null);
    };
    img.src = URL.createObjectURL(file);
  };

  const handleClear = () => { setUploadedImage(null); setProcessedImage(null); };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-black text-white selection:bg-science-500/30">
      <ControlPanel 
        camera={camera} setCamera={setCamera}
        aperture={aperture} setAperture={setAperture}
        simResult={simResult} isProcessing={isProcessing}
        onSimulate={runSimulation} 
        onCancel={terminateWorker}
        exposure={exposure} setExposure={setExposure}
      />
      <Viewport 
        originalImage={uploadedImage}
        processedImage={processedImage}
        onUpload={handleUpload}
        onClear={handleClear}
        isProcessing={isProcessing}
      />
    </div>
  );
};

export default App;
