
import React, { useEffect, useRef } from 'react';

interface ViewportProps {
  originalImage: ImageData | null;
  processedImage: ImageData | null;
  onUpload: (file: File) => void;
  onClear: () => void;
  isProcessing: boolean;
}

const TrashIcon = () => (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
    </svg>
);

const Viewport: React.FC<ViewportProps> = ({ originalImage, processedImage, onUpload, onClear, isProcessing }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const imgData = processedImage || originalImage;

    if (imgData && imgData.width > 0 && imgData.height > 0) {
      canvas.width = imgData.width;
      canvas.height = imgData.height;
      ctx.putImageData(imgData, 0, 0);
    } else {
        // Clear canvas
        canvas.width = 800; 
        canvas.height = 600;
        ctx.clearRect(0,0, canvas.width, canvas.height);
        
        // Technical placeholder
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(0,0, canvas.width, canvas.height);
        
        // Draw centered crosshair
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        ctx.strokeStyle = "#333";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx - 20, cy); ctx.lineTo(cx + 20, cy);
        ctx.moveTo(cx, cy - 20); ctx.lineTo(cx, cy + 20);
        ctx.stroke();
        
        ctx.fillStyle = "#444";
        ctx.textAlign = "center";
        ctx.font = "12px 'JetBrains Mono', monospace";
        ctx.fillText("SENSOR EMPTY", canvas.width/2, canvas.height/2 + 40);
        ctx.fillStyle = "#333";
        ctx.font = "10px 'Inter', sans-serif";
        ctx.fillText("DRAG AND DROP SOURCE OR UPLOAD", canvas.width/2, canvas.height/2 + 55);
    }
  }, [originalImage, processedImage]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      const file = e.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
          onUpload(file);
      }
    }
  };

  return (
    <div 
      className="flex-1 bg-mono-950 bg-tech-grid relative overflow-hidden flex flex-col items-center justify-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      {/* Top Toolbar */}
      <div className="absolute top-6 z-10 flex gap-2 backdrop-blur-md bg-black/60 p-1.5 rounded-full border border-white/10 shadow-xl">
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="bg-white/10 hover:bg-white/20 text-gray-200 text-xs px-4 py-2 rounded-full border border-white/5 transition-all shadow-lg font-medium"
        >
          Load Source
        </button>
        {originalImage && (
            <button 
              onClick={onClear}
              className="bg-red-500/10 hover:bg-red-500/20 text-red-400 text-xs px-3 py-2 rounded-full border border-red-500/20 transition-all flex items-center gap-1"
              title="Clear Sensor"
            >
              <TrashIcon />
            </button>
        )}
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/*"
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
        />
      </div>

      {/* Main Canvas Container */}
      <div className="relative p-1 border border-white/5 bg-black shadow-2xl shadow-black rounded-sm">
        {/* Sensor Frame Marks (Corner Brackets) */}
        <div className="absolute top-[-1px] left-[-1px] w-4 h-4 border-t border-l border-science-500/50"></div>
        <div className="absolute top-[-1px] right-[-1px] w-4 h-4 border-t border-r border-science-500/50"></div>
        <div className="absolute bottom-[-1px] left-[-1px] w-4 h-4 border-b border-l border-science-500/50"></div>
        <div className="absolute bottom-[-1px] right-[-1px] w-4 h-4 border-b border-r border-science-500/50"></div>

        <canvas 
            ref={canvasRef} 
            className="max-w-full max-h-[80vh] object-contain block bg-[#050505]"
            style={{ imageRendering: 'pixelated' }} 
        />
        
        {isProcessing && (
            <div className="absolute inset-0 bg-black/80 flex flex-col items-center justify-center backdrop-blur-sm z-20">
                <div className="w-12 h-12 border-2 border-science-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                <div className="text-science-400 font-mono text-xs tracking-widest animate-pulse">INTEGRATING...</div>
            </div>
        )}
      </div>

      <div className="absolute bottom-6 left-6 text-[10px] text-gray-700 font-mono select-none">
          SENSOR_READOUT::ACTIVE
      </div>
    </div>
  );
};

export default Viewport;
