
import { ApertureConfig, ApertureType, CameraConfig, ExportConfig, ProductionItem, MultiDotPattern } from '../types';

const formatNum = (n: number) => n.toFixed(4).replace(/\.?0+$/, "");

// Helper to generate path data for a single aperture
const getAperturePath = (
    aperture: ApertureConfig, 
    camera: CameraConfig, 
    config: ExportConfig,
    centerX: number,
    centerY: number
): string => {
    
    // Validation: prevent rendering invalid sizes
    if (aperture.diameter <= 0) return "";

    const lambda = (camera.wavelength || 550) * 1e-6;
    const f = camera.focalLength || 50;
    let content = "";
    
    // Inverted check for bridges: if inverted (print), we don't need bridges usually.
    // Bridges are for physical stencils to keep the center from falling out.
    const useBridges = config.addBridges && !config.inverted;

    const addCircle = (cx: number, cy: number, r: number) => {
        if (r <= 0) return;
        content += `<circle cx="${formatNum(cx)}" cy="${formatNum(cy)}" r="${formatNum(r)}" class="cut" />`;
    };
    
    const addRect = (cx: number, cy: number, w: number, h: number) => {
        if (w <= 0 || h <= 0) return;
        content += `<rect x="${formatNum(cx - w/2)}" y="${formatNum(cy - h/2)}" width="${formatNum(w)}" height="${formatNum(h)}" class="cut" />`;
    };

    const addPolygon = (points: {x: number, y: number}[]) => {
        const pts = points.map(p => `${formatNum(p.x + centerX)},${formatNum(p.y + centerY)}`).join(" ");
        content += `<polygon points="${pts}" class="cut" />`;
    };

    const addPath = (d: string) => {
        content += `<path d="${d}" class="cut" />`;
    }

    const addStenciledCircle = (cx: number, cy: number, r: number, bridges: number = 3) => {
        if (r <= 0) return;
        if (!useBridges) {
            addCircle(cx, cy, r);
            return;
        }
        const bridgeRad = (config.bridgeSizeMm / r); 
        const step = (Math.PI * 2) / bridges;
        let d = "";
        for(let i=0; i<bridges; i++) {
            const startAngle = i * step + bridgeRad/2;
            const endAngle = (i+1) * step - bridgeRad/2;
            const x1 = cx + r * Math.cos(startAngle);
            const y1 = cy + r * Math.sin(startAngle);
            const x2 = cx + r * Math.cos(endAngle);
            const y2 = cy + r * Math.sin(endAngle);
            
            const largeArc = (endAngle - startAngle) > Math.PI ? 1 : 0;
            
            // Move to start, Arc to end
            d += `M ${formatNum(x1)} ${formatNum(y1)} A ${formatNum(r)} ${formatNum(r)} 0 ${largeArc} 1 ${formatNum(x2)} ${formatNum(y2)} `;
        }
        addPath(d);
    };

    switch (aperture.type) {
        case ApertureType.PINHOLE:
            addCircle(centerX, centerY, aperture.diameter / 2);
            break;

        case ApertureType.SLIT:
            addRect(centerX, centerY, aperture.diameter || 5.0, aperture.slitWidth || 0.2);
            break;

        case ApertureType.CROSS:
            const w = aperture.slitWidth || 0.5;
            const len = aperture.diameter;
            // Draw as two rects
            addRect(centerX, centerY, w, len);
            addRect(centerX, centerY, len, w);
            break;

        case ApertureType.LITHO_OPC:
            {
                 const featureLen = (aperture.diameter || 2.0);
                 const featureWid = (featureLen * 0.2); 
                 const srafDist = (aperture.slitWidth || 0.05) * 2; 
                 const srafWid = (aperture.slitWidth || 0.05);
                 
                 // Main Bar
                 addRect(centerX, centerY, featureLen, featureWid);
                 
                 // Hammerheads
                 const headSize = featureWid * 1.5;
                 addRect(centerX - featureLen/2 + headSize/2, centerY, headSize, headSize);
                 addRect(centerX + featureLen/2 - headSize/2, centerY, headSize, headSize);
                 
                 // SRAFs
                 addRect(centerX, centerY - headSize/2 - srafDist - srafWid/2, featureLen, srafWid);
                 addRect(centerX, centerY + headSize/2 + srafDist + srafWid/2, featureLen, srafWid);
            }
            break;

        case ApertureType.ZONE_PLATE:
            const maxR_mm = aperture.diameter / 2;
            const maxN = Math.floor(Math.pow(maxR_mm, 2) / (lambda * f));
            // Ensure at least one zone
            for (let n = Math.max(1, maxN); n >= 1; n--) {
                 const r_mm = Math.sqrt(n * lambda * f);
                 // Only cut the odd zones (transparent)
                 if (n % 2 === 1) {
                    addStenciledCircle(centerX, centerY, r_mm, 3);
                 }
            }
            break;

        case ApertureType.ANNULAR:
            const rOut = aperture.diameter / 2;
            const rIn = rOut * 0.6;
            
            if (config.inverted) {
                // For Print: Single path with hole using fill-rule
                const path = `M ${formatNum(centerX - rOut)} ${formatNum(centerY)} ` +
                             `A ${formatNum(rOut)} ${formatNum(rOut)} 0 1 0 ${formatNum(centerX + rOut)} ${formatNum(centerY)} ` +
                             `A ${formatNum(rOut)} ${formatNum(rOut)} 0 1 0 ${formatNum(centerX - rOut)} ${formatNum(centerY)} ` +
                             `M ${formatNum(centerX - rIn)} ${formatNum(centerY)} ` +
                             `A ${formatNum(rIn)} ${formatNum(rIn)} 0 1 1 ${formatNum(centerX + rIn)} ${formatNum(centerY)} ` +
                             `A ${formatNum(rIn)} ${formatNum(rIn)} 0 1 1 ${formatNum(centerX - rIn)} ${formatNum(centerY)} Z`;
                addPath(path);
            } else {
                // For Cut: Cut both boundaries (with bridges)
                addStenciledCircle(centerX, centerY, rOut, 3);
                addStenciledCircle(centerX, centerY, rIn, 3);
            }
            break;

        case ApertureType.WAVES:
        case ApertureType.YIN_YANG:
             {
                 const width = aperture.diameter || 10;
                 const thickness = aperture.slitWidth || 0.1;
                 const amplitude = aperture.slitHeight || 2.0;
                 const waves = aperture.count || 1;
                 
                 // SVG path construction for sine wave
                 // We will approximate with many small line segments for SVG
                 const steps = 100 * waves;
                 let d = "";
                 
                 // Center the wave
                 const startX = centerX - width/2;
                 
                 for (let i=0; i<=steps; i++) {
                      const xNorm = i/steps; 
                      const x = startX + (xNorm * width);
                      const angle = xNorm * Math.PI * 2 * waves;
                      const y = centerY + (amplitude/2) * Math.sin(angle);
                      if (i===0) d += `M ${formatNum(x)} ${formatNum(y)} `;
                      else d += `L ${formatNum(x)} ${formatNum(y)} `;
                 }
                 
                 content += `<path d="${d}" fill="none" stroke="black" stroke-width="${thickness}" />`;
                 
                 if (aperture.type === ApertureType.YIN_YANG) {
                     const dotR = (aperture.innerDiameter || 0.2) / 2;
                     for(let w=0; w<waves; w++) {
                         const peakXNorm = (w + 0.25) / waves;
                         const troughXNorm = (w + 0.75) / waves;
                         
                         const px = startX + (peakXNorm * width);
                         // const py = centerY + (amplitude/2);
                         const py = centerY; // BASELINE
                         
                         const tx = startX + (troughXNorm * width);
                         // const ty = centerY - (amplitude/2);
                         const ty = centerY; // BASELINE
                         
                         addCircle(px, py, dotR);
                         addCircle(tx, ty, dotR);
                     }
                 }
             }
             break;

        case ApertureType.STAR:
            {
                const spikes = aperture.spikes || 5;
                const outerRadius = aperture.diameter / 2;
                const innerRadius = outerRadius * 0.4;
                const pts = [];
                let rot = Math.PI / 2 * 3;
                const step = Math.PI / spikes;
                
                for (let i = 0; i < spikes; i++) {
                    pts.push({
                        x: Math.cos(rot) * outerRadius,
                        y: Math.sin(rot) * outerRadius
                    });
                    rot += step;
                    pts.push({
                        x: Math.cos(rot) * innerRadius,
                        y: Math.sin(rot) * innerRadius
                    });
                    rot += step;
                }
                addPolygon(pts);
            }
            break;

        case ApertureType.FRACTAL:
            {
                const size = (aperture.spread || aperture.diameter * 5);
                const iter = aperture.iteration || 3;
                
                const generateRects = (x: number, y: number, s: number, depth: number) => {
                    if (depth === 0) {
                        addRect(centerX + x, centerY + y, s, s);
                        return;
                    }
                    const newS = s / 3;
                    for (let dx = -1; dx <= 1; dx++) {
                        for (let dy = -1; dy <= 1; dy++) {
                            if (dx === 0 && dy === 0) continue; // Hole in center
                            generateRects(x + dx * newS, y + dy * newS, newS, depth - 1);
                        }
                    }
                };
                
                generateRects(0, 0, size, iter);
            }
            break;
            
        case ApertureType.SIERPINSKI_TRIANGLE:
            {
                 const size = (aperture.spread || 2.0);
                 const iter = aperture.iteration || 3;
                 const R = size / Math.sqrt(3);
                 
                 // Vertices of the main triangle centered at 0,0
                 const p1 = { x: 0, y: -R };
                 const p2 = { x: size/2, y: R/2 };
                 const p3 = { x: -size/2, y: R/2 };
        
                 const drawTri = (v1: {x:number, y:number}, v2: {x:number, y:number}, v3: {x:number, y:number}, depth: number) => {
                     if (depth === 0) {
                         const pts = [v1, v2, v3];
                         addPolygon(pts);
                         return;
                     }
                     
                     // Midpoints
                     const m12 = { x: (v1.x + v2.x)/2, y: (v1.y + v2.y)/2 };
                     const m23 = { x: (v2.x + v3.x)/2, y: (v2.y + v3.y)/2 };
                     const m31 = { x: (v3.x + v1.x)/2, y: (v3.y + v1.y)/2 };
                     
                     drawTri(v1, m12, m31, depth - 1);
                     drawTri(m12, v2, m23, depth - 1);
                     drawTri(m31, m23, v3, depth - 1);
                 };
        
                 drawTri(p1, p2, p3, iter);
            }
            break;

        case ApertureType.MULTI_DOT:
            const pattern = aperture.multiDotPattern || MultiDotPattern.RING;
            const count = Math.max(1, aperture.count || 8);
            const spread = (aperture.spread || 2.0);
            const dotR = (aperture.diameter || 0.2) / 2;
            let mRng = aperture.seed || 123;
            const rand = () => { mRng = (mRng * 1664525 + 1013904223) % 4294967296; return mRng / 4294967296; };

            if (aperture.centerDot) {
                 addCircle(centerX, centerY, dotR);
            }

            switch(pattern) {
              case MultiDotPattern.RING:
                for(let i=0; i<count; i++) {
                  const theta = (i / count) * Math.PI * 2;
                  addCircle(centerX + spread*Math.cos(theta), centerY + spread*Math.sin(theta), dotR);
                }
                break;
              case MultiDotPattern.LINE:
                const startX = -spread / 2;
                const step = count > 1 ? spread / (count - 1) : 0;
                for(let i=0; i<count; i++) {
                  addCircle(centerX + startX + i*step, centerY, dotR);
                }
                break;
              case MultiDotPattern.GRID:
                const side = Math.ceil(Math.sqrt(count));
                const spacing = spread / Math.max(1, side - 1);
                const offset = spread / 2;
                let drawn = 0;
                for(let r=0; r<side; r++) {
                  for(let c=0; c<side; c++) {
                    if(drawn >= count) break;
                    addCircle(centerX + c*spacing - offset, centerY + r*spacing - offset, dotR);
                    drawn++;
                  }
                }
                break;
              case MultiDotPattern.CONCENTRIC:
                const rings = 5;
                const perRing = Math.ceil(count / rings);
                for(let r=1; r<=rings; r++) {
                  const rad = (r/rings) * spread;
                  for(let k=0; k<perRing; k++) {
                    const a = (k/perRing) * Math.PI*2;
                    addCircle(centerX + rad*Math.cos(a), centerY + rad*Math.sin(a), dotR);
                  }
                }
                break;
              case MultiDotPattern.RANDOM:
                for(let i=0; i<count; i++) {
                  const r = spread * Math.sqrt(rand());
                  const th = 2 * Math.PI * rand();
                  addCircle(centerX + r*Math.cos(th), centerY + r*Math.sin(th), dotR);
                }
                break;
            }
            break;

        case ApertureType.FIBONACCI:
            const points = Math.max(1, aperture.count || 50);
            const maxRad = aperture.spread || 2.0;
            const fDotR = (aperture.diameter || 0.1) / 2;
            const goldenAngle = Math.PI * (3 - Math.sqrt(5)); 
            for (let i = 0; i < points; i++) {
               const r = maxRad * Math.sqrt(i / points);
               const theta = i * goldenAngle;
               addCircle(centerX + r * Math.cos(theta), centerY + r * Math.sin(theta), fDotR);
            }
            break;

        case ApertureType.PHOTON_SIEVE:
             const sieveZones = aperture.zones || 15;
             let rng = aperture.seed || 12345;
             const nextRnd = () => { rng = (rng * 1664525 + 1013904223) % 4294967296; return rng / 4294967296; };
             const maxSieveR = aperture.diameter / 2;
             for (let n = 1; n <= sieveZones * 2; n += 2) {
                 const r_center_mm = Math.sqrt((n + 0.5) * lambda * f);
                 const r_width_mm = Math.sqrt((n + 1) * lambda * f) - Math.sqrt(n * lambda * f);
                 if (r_center_mm > maxSieveR) break;
                 
                 const hole_d = 1.53 * r_width_mm;
                 if (hole_d <= 0.001) continue; 
                 
                 const circumference = 2 * Math.PI * r_center_mm;
                 const numHoles = Math.floor((circumference / (hole_d * 1.5)));
                 
                 for(let k=0; k<numHoles; k++) {
                     const theta = (k / numHoles) * Math.PI * 2 + (nextRnd() * 0.5);
                     addCircle(centerX + r_center_mm*Math.cos(theta), centerY + r_center_mm*Math.sin(theta), hole_d/2);
                 }
             }
             break;
             
        case ApertureType.FREEFORM:
             if (aperture.customPath && aperture.customPath.length > 0) {
                  const scale = aperture.diameter || 5; 
                  const r = scale / 2;
                  
                  // Handle broken paths via NaN
                  let d = "";
                  let penDown = false;
                  
                  for(let i=0; i<aperture.customPath.length; i++) {
                      const p = aperture.customPath[i];
                      if (isNaN(p.x)) {
                          penDown = false;
                          continue;
                      }
                      const px = centerX + p.x * r;
                      const py = centerY + p.y * r;
                      
                      if (!penDown) {
                          d += `M ${formatNum(px)} ${formatNum(py)} `;
                          penDown = true;
                      } else {
                          d += `L ${formatNum(px)} ${formatNum(py)} `;
                      }
                  }
                  
                  if (d.length > 0) {
                      addPath(d);
                  }
             }
             break;

        case ApertureType.RANDOM:
             {
                const rRadius = aperture.diameter / 2;
                let rRng = 999;
                const rNext = () => { rRng = (rRng * 9301 + 49297) % 233280; return rRng / 233280; };
                for(let i=0; i<300; i++) {
                    const r = rRadius * Math.sqrt(rNext());
                    const th = 2 * Math.PI * rNext();
                    const s = (0.05) * (0.5 + rNext()); 
                    addCircle(centerX + r*Math.cos(th), centerY + r*Math.sin(th), s);
                }
             }
             break;

        default:
             addCircle(centerX, centerY, aperture.diameter/2);
             break;
    }
    return content;
};

// --- Single Item Export ---
export const generateBlueprintSVG = (
  aperture: ApertureConfig,
  camera: CameraConfig,
  config: ExportConfig
): string => {
  const sizeMm = Math.max(10, aperture.diameter * 1.5); 
  const center = sizeMm / 2;
  const dateStr = new Date().toISOString();
  
  const content = getAperturePath(aperture, camera, config, 0, 0);

  return `<!-- Generated by OpticLab at ${dateStr} -->
<svg xmlns="http://www.w3.org/2000/svg" width="${sizeMm}mm" height="${sizeMm}mm" viewBox="0 0 ${sizeMm} ${sizeMm}">
    <defs>
      <style>
        .cut { fill: ${config.inverted ? 'black' : 'none'}; stroke: ${config.inverted ? 'none' : 'black'}; stroke-width: 0.05; vector-effect: non-scaling-stroke; fill-rule: evenodd; }
      </style>
    </defs>
    <title>${aperture.type} Aperture</title>
    <desc>Diameter: ${aperture.diameter}mm, Camera FL: ${camera.focalLength}mm</desc>
    <g transform="translate(${center}, ${center}) rotate(${aperture.rotation || 0})">
        ${content}
    </g>
</svg>`;
};

// --- Batch Sheet Export ---
export const generateSheetSVG = (
    items: ProductionItem[],
    config: ExportConfig
): string => {
    const { sheetWidth, sheetHeight, itemSize, spacing } = config;
    const dateStr = new Date().toISOString();
    
    // Grid calc
    const cols = Math.floor((sheetWidth - spacing) / (itemSize + spacing));
    const rows = Math.floor((sheetHeight - spacing) / (itemSize + spacing));
    
    const totalSlots = cols * rows;
    
    let svg = `<!-- Generated by OpticLab Batch Mode at ${dateStr} -->
<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}mm" height="${sheetHeight}mm" viewBox="0 0 ${sheetWidth} ${sheetHeight}">
      <defs>
        <style>
          .cut { fill: ${config.inverted ? 'black' : 'none'}; stroke: ${config.inverted ? 'none' : 'black'}; stroke-width: 0.05; vector-effect: non-scaling-stroke; fill-rule: evenodd; }
          .guide { fill: none; stroke: #ccc; stroke-width: 0.1; stroke-dasharray: 2 2; }
          .mark { stroke: red; stroke-width: 0.1; }
          .label { font-family: sans-serif; font-size: 2px; fill: #666; }
        </style>
      </defs>
      <title>OpticLab Production Sheet</title>`;

    // Draw Crop Marks (Corner L-shapes)
    const marginX = (sheetWidth - (cols * (itemSize + spacing) - spacing)) / 2;
    const marginY = (sheetHeight - (rows * (itemSize + spacing) - spacing)) / 2;

    for (let i = 0; i < items.length && i < totalSlots; i++) {
        const item = items[i];
        const r = Math.floor(i / cols);
        const c = i % cols;
        
        const x = marginX + c * (itemSize + spacing) + itemSize/2;
        const y = marginY + r * (itemSize + spacing) + itemSize/2;
        
        if (config.inverted) {
             svg += `<rect x="${(x - itemSize/2).toFixed(2)}" y="${(y - itemSize/2).toFixed(2)}" width="${itemSize}" height="${itemSize}" class="guide" />`;
        } else {
             svg += `<rect x="${(x - itemSize/2).toFixed(2)}" y="${(y - itemSize/2).toFixed(2)}" width="${itemSize}" height="${itemSize}" class="mark" />`;
        }
        
        svg += `<text x="${(x - itemSize/2 + 1).toFixed(2)}" y="${(y + itemSize/2 - 1).toFixed(2)}" class="label">${item.name} (${item.camera.focalLength}mm)</text>`;

        svg += `<g transform="rotate(${item.aperture.rotation || 0}, ${x}, ${y})">`;
        svg += getAperturePath(item.aperture, item.camera, config, x, y);
        svg += `</g>`;
    }
    
    svg += `</svg>`;
    return svg;
};
