
import React, { useRef, useEffect, useState } from 'react';
import { ApertureConfig, ApertureType, CameraConfig } from '../types';
import { drawAperture } from '../utils/physics';

interface AperturePreviewProps {
  aperture: ApertureConfig;
  camera: CameraConfig;
  onUpdateAperture?: (updates: Partial<ApertureConfig>) => void;
  showMountOverlay?: boolean;
  mountSizeMm?: number;
}

const AperturePreview: React.FC<AperturePreviewProps> = ({ 
    aperture, 
    camera, 
    onUpdateAperture,
    showMountOverlay: initialOverlay = true, // Default to true for better UX given user context
    mountSizeMm = 50 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [showOverlay, setShowOverlay] = useState(initialOverlay);
  const [maskImgElement, setMaskImgElement] = useState<HTMLImageElement | null>(null);

  // Load the mask image when URL changes
  useEffect(() => {
      if (aperture.type === ApertureType.CUSTOM && aperture.maskImage) {
          const img = new Image();
          img.src = aperture.maskImage;
          img.onload = () => setMaskImgElement(img);
      } else {
          setMaskImgElement(null);
      }
  }, [aperture.type, aperture.maskImage]);
  
  // Helper to get drawing params
  const getDrawParams = (canvas: HTMLCanvasElement) => {
      const rect = canvas.getBoundingClientRect();
      const width = rect.width;
      const height = rect.height;
      const size = Math.min(width, height);
      
      // Determine effective size for scaling to fit the box
      let maxDimension = aperture.diameter;
      
      if (aperture.type === ApertureType.MULTI_DOT || aperture.type === ApertureType.FIBONACCI || aperture.type === ApertureType.RANDOM) {
           maxDimension = Math.max(aperture.diameter, (aperture.spread || 2) * 2.5);
      } else if (aperture.type === ApertureType.FRACTAL || aperture.type === ApertureType.SIERPINSKI_TRIANGLE) {
           maxDimension = (aperture.spread || 10) * 1.2;
      } else if (aperture.type === ApertureType.FREEFORM) {
           maxDimension = (aperture.diameter || 10) * 1.1;
      } else if (aperture.type === ApertureType.WAVES || aperture.type === ApertureType.YIN_YANG) {
           // Important: Include Amplitude (slitHeight) in sizing
           const w = aperture.diameter || 10;
           const h = aperture.slitHeight || 2.0;
           maxDimension = Math.max(w, h) * 1.2;
      } else if (aperture.type === ApertureType.SLIT || aperture.type === ApertureType.CROSS) {
           maxDimension = (aperture.diameter || 5) * 1.2;
      }
      
      if (showOverlay) {
          maxDimension = Math.max(maxDimension, mountSizeMm * 1.1);
      }
      
      const targetPx = size * 0.85; 
      const safeDimension = Math.max(0.1, maxDimension);
      const scale = targetPx / safeDimension;
      
      const radiusPx = (safeDimension * scale) / 2;
      return { width, height, scale, radiusPx, maxDimension };
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);

    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Background
    ctx.fillStyle = '#111';
    ctx.fillRect(0, 0, rect.width, rect.height);
    
    // Grid
    ctx.strokeStyle = '#222';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, centerY); ctx.lineTo(rect.width, centerY);
    ctx.moveTo(centerX, 0); ctx.lineTo(centerX, rect.height);
    ctx.stroke();

    const { scale } = getDrawParams(canvas);
    
    ctx.translate(centerX, centerY);
    
    // --- Draw Mount Overlay (Behind) ---
    if (showOverlay) {
        const mountPx = mountSizeMm * scale;
        // Draw Frame
        ctx.strokeStyle = '#333'; 
        ctx.lineWidth = 2;
        ctx.beginPath();
        // Rounded rect for slide mount look
        const r = 4;
        const hs = mountPx/2;
        ctx.moveTo(-hs+r, -hs);
        ctx.lineTo(hs-r, -hs); ctx.quadraticCurveTo(hs, -hs, hs, -hs+r);
        ctx.lineTo(hs, hs-r); ctx.quadraticCurveTo(hs, hs, hs-r, hs);
        ctx.lineTo(-hs+r, hs); ctx.quadraticCurveTo(-hs, hs, -hs, hs-r);
        ctx.lineTo(-hs, -hs+r); ctx.quadraticCurveTo(-hs, -hs, -hs+r, -hs);
        ctx.stroke();
        
        // Inner Window (approx standard slide window 24x36 or similar, assume square 35mm for generic)
        const windowPx = 35 * scale;
        ctx.strokeStyle = '#444';
        ctx.setLineDash([2, 2]);
        ctx.strokeRect(-windowPx/2, -windowPx/2, windowPx, windowPx);
        ctx.setLineDash([]);
        
        ctx.fillStyle = '#444';
        ctx.font = '10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${mountSizeMm}mm Mount`, -mountPx/2, -mountPx/2 - 5);
    }
    
    // --- Draw Aperture ---
    // If Custom, we need to handle the image drawing and thresholding here
    // because drawAperture utility is shared with worker and might not have Image access easily without passing data
    if (aperture.type === ApertureType.CUSTOM && maskImgElement) {
        const diameterPx = aperture.diameter * scale;
        const radiusPx = diameterPx / 2;
        
        // Draw to temp canvas to process pixels
        const tempC = document.createElement('canvas');
        tempC.width = diameterPx;
        tempC.height = diameterPx;
        const tempCtx = tempC.getContext('2d');
        if (tempCtx) {
            tempCtx.save();
            // Rotation
            tempCtx.translate(radiusPx, radiusPx);
            tempCtx.rotate((aperture.rotation || 0) * Math.PI / 180);
            tempCtx.translate(-radiusPx, -radiusPx);
            
            tempCtx.drawImage(maskImgElement, 0, 0, diameterPx, diameterPx);
            tempCtx.restore();

            // Thresholding
            const idata = tempCtx.getImageData(0,0, diameterPx, diameterPx);
            const data = idata.data;
            const thresh = aperture.maskThreshold ?? 128;
            const invert = aperture.maskInvert || false;

            for(let i=0; i<data.length; i+=4) {
                const avg = (data[i] + data[i+1] + data[i+2]) / 3;
                let val = avg > thresh ? 255 : 0;
                if (invert) val = 255 - val;
                
                // Mask: White is hole (transparent on black BG in reality, but for preview we want White Hole)
                data[i] = val; // R
                data[i+1] = val; // G
                data[i+2] = val; // B
                data[i+3] = 255; // Alpha
            }
            tempCtx.putImageData(idata, 0, 0);
            
            ctx.shadowBlur = 10;
            ctx.shadowColor = 'rgba(14, 165, 233, 0.3)';
            ctx.drawImage(tempC, -radiusPx, -radiusPx);
            ctx.shadowBlur = 0;
        }
    } else {
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(14, 165, 233, 0.3)';
        drawAperture(ctx, scale, aperture, camera.wavelength, camera.focalLength);
        ctx.shadowBlur = 0;
    }
    
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    
    // Scale Bar
    const barWidthPx = 1.0 * scale; 
    
    ctx.fillStyle = '#666';
    ctx.fillRect(10, rect.height - 20, barWidthPx, 2);
    ctx.fillStyle = '#888';
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`1mm`, 10, rect.height - 25);
    
    if (aperture.type === ApertureType.FREEFORM) {
        ctx.textAlign = 'right';
        ctx.fillStyle = isDrawing ? '#0ea5e9' : '#555';
        ctx.fillText(isDrawing ? "DRAWING..." : "DRAW: CLICK & DRAG", rect.width - 10, 15);
    } else if (aperture.type === ApertureType.CUSTOM) {
        ctx.textAlign = 'right';
        ctx.fillStyle = '#555';
        ctx.fillText("CUSTOM IMPORT", rect.width - 10, 15);
    }

  }, [aperture, camera, isDrawing, showOverlay, mountSizeMm, maskImgElement]);

  // Mouse handlers
  const handleMouseDown = (e: React.MouseEvent) => {
      if (aperture.type !== ApertureType.FREEFORM || !onUpdateAperture) return;
      setIsDrawing(true);
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const { width, height, maxDimension } = getDrawParams(canvas);
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      // Canvas Coords:
      const cx = x - width/2; // px from center
      const cy = y - height/2; 
      
      // Scale back to normalized
      const { scale } = getDrawParams(canvas);
      const radiusPx = (aperture.diameter * scale) / 2;
      
      const nx = cx / radiusPx;
      const ny = cy / radiusPx;

      const newPath = [...(aperture.customPath || [])];
      if (newPath.length > 0) {
          newPath.push({x: NaN, y: NaN}); // Pen Up
      }
      newPath.push({x: nx, y: ny});

      onUpdateAperture({ customPath: newPath });
  };
  
  const handleMouseMove = (e: React.MouseEvent) => {
      if (!isDrawing || aperture.type !== ApertureType.FREEFORM || !onUpdateAperture) return;
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      const { width, height, scale } = getDrawParams(canvas);
      const radiusPx = (aperture.diameter * scale) / 2;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      
      const nx = (x - width/2) / radiusPx;
      const ny = (y - height/2) / radiusPx;

      onUpdateAperture({ customPath: [...(aperture.customPath || []), {x: nx, y: ny}] });
  };

  const handleMouseUp = () => setIsDrawing(false);

  return (
    <div className="relative group">
        <canvas 
            ref={canvasRef} 
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            style={{ width: '100%', height: '240px' }}
            className={`block bg-mono-900 border border-gray-800 rounded-lg shadow-inner mb-4 ${aperture.type === ApertureType.FREEFORM ? 'cursor-crosshair' : 'cursor-default'}`}
        />
        <button 
            onClick={() => setShowOverlay(!showOverlay)}
            className="absolute top-2 left-2 px-2 py-1 bg-black/50 hover:bg-black/80 text-[10px] text-gray-400 rounded border border-gray-700 backdrop-blur-sm"
        >
            {showOverlay ? 'HIDE MOUNT' : 'SHOW MOUNT'}
        </button>
        <div className="absolute top-2 right-2 text-[10px] text-gray-500 font-mono opacity-50 group-hover:opacity-100 transition-opacity pointer-events-none">
            {aperture.type === ApertureType.FREEFORM ? 'DRAW SHAPE' : 'VISUALIZATION'}
        </div>
    </div>
  );
};

export default AperturePreview;
