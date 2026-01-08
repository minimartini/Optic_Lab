
import React, { useRef, useEffect } from 'react';
import { ApertureConfig, CameraConfig, SimulationResult } from '../types';

interface PSFPreviewProps {
  aperture: ApertureConfig;
  camera: CameraConfig;
  simResult: SimulationResult;
  kernel?: Float32Array | null;
}

const PSFPreview: React.FC<PSFPreviewProps> = ({ aperture, camera, simResult, kernel }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Canvas setup
    const canvasSize = 240; 
    const dpr = window.devicePixelRatio || 1;
    
    if (canvas.width !== canvasSize * dpr) {
        canvas.width = canvasSize * dpr;
        canvas.height = canvasSize * dpr;
        ctx.scale(dpr, dpr);
    }
    
    // Clear
    ctx.fillStyle = 'black';
    ctx.fillRect(0,0, canvasSize, canvasSize);

    if (!kernel || kernel.length === 0) {
        ctx.fillStyle = '#333';
        ctx.textAlign = 'center';
        ctx.font = '12px monospace';
        ctx.fillText("Simulating...", canvasSize/2, canvasSize/2);
        return;
    }

    const kSize = Math.sqrt(kernel.length);

    // Create Heatmap
    const kCanvas = document.createElement('canvas');
    kCanvas.width = kSize;
    kCanvas.height = kSize;
    const kCtx = kCanvas.getContext('2d');
    if(!kCtx) return;

    const kImgData = kCtx.createImageData(kSize, kSize);
    const kData = kImgData.data;

    let maxVal = 0;
    // Determine max value for normalization
    for(let i=0; i<kernel.length; i++) {
        if(kernel[i] > maxVal) maxVal = kernel[i];
    }

    // Logarithmic Mapping
    const logScale = (val: number) => {
        // Prevent log(0)
        const v = Math.max(0, val);
        const factor = 10000;
        if (maxVal === 0) return 0;
        return Math.log(1 + v * factor) / Math.log(1 + maxVal * factor);
    };

    for (let i = 0; i < kernel.length; i++) {
        const val = kernel[i];
        const logVal = logScale(val);
        
        // Magma-like Colormap
        let r=0, g=0, b=0;
        
        if (logVal < 0.2) { 
                b = (logVal / 0.2) * 255; 
        } else if (logVal < 0.5) { 
                b = 255;
                r = ((logVal - 0.2) / 0.3) * 255;
        } else if (logVal < 0.8) { 
                b = (1 - (logVal - 0.5) / 0.3) * 255;
                r = 255;
                g = ((logVal - 0.5) / 0.3) * 160;
        } else { 
                r = 255;
                g = 160 + ((logVal - 0.8) / 0.2) * 95;
                b = ((logVal - 0.8) / 0.2) * 255;
        }

        kData[i*4] = Math.floor(r);
        kData[i*4+1] = Math.floor(g);
        kData[i*4+2] = Math.floor(b);
        kData[i*4+3] = 255;
    }

    kCtx.putImageData(kImgData, 0, 0);

    // Draw Kernel scaled up
    // We want the Kernel to fit nicely in the 240px preview.
    const displaySize = Math.min(canvasSize * 0.9, kSize * 4); // Heuristic scale
    
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(kCanvas, 
        (canvasSize - displaySize)/2, 
        (canvasSize - displaySize)/2, 
        displaySize, displaySize
    );

    // Scale Bar calculation (approximate based on kernel resolution vs physics)
    // The kernel corresponds to the processingWidth used in the worker.
    // This display is qualitative. 
    
    ctx.fillStyle = '#666';
    ctx.textAlign = 'right';
    ctx.fillText("Logarithmic PSF", canvasSize - 10, 15);
  }, [kernel]);

  return (
    <div className="relative group bg-black border border-gray-800 rounded-lg shadow-inner mb-4">
        <canvas 
            ref={canvasRef} 
            style={{ width: '100%', height: '240px' }}
            className="block cursor-crosshair"
        />
        <div className="absolute top-2 right-2 text-[10px] text-gray-500 font-mono opacity-50 group-hover:opacity-100 transition-opacity">
            DIFFRACTION PATTERN
        </div>
    </div>
  );
};

export default PSFPreview;
