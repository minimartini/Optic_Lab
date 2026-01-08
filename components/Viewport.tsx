
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

    // Determine which image to show
    const imgData = processedImage || originalImage;

    if (imgData && imgData.width > 0 && imgData.height > 0) {
      canvas.width = imgData.width;
      canvas.height = imgData.height;
      ctx.putImageData(imgData, 0, 0);
    } else {
        // Clear canvas
        canvas.width = 800; // Set default size to avoid 0x0 issues
        canvas.height = 600;
        ctx.clearRect(0,0, canvas.width, canvas.height);
        // Draw placeholder text
        ctx.fillStyle = "#111";
        ctx.fillRect(0,0, canvas.width, canvas.height);
        ctx.fillStyle = "#444";
        ctx.textAlign = "center";
        ctx.font = "14px monospace";
        ctx.fillText("No Image Loaded - Using Point Source", canvas.width/2, canvas.height/2);
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
      className="flex-1 bg-black relative overflow-hidden flex flex-col items-center justify-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
    >
      <div className="absolute top-4 left-4 z-10 flex gap-2">
        <button 
          onClick={() => fileInputRef.current?.click()}
          className="bg-gray-800 hover:bg-gray-700 text-white text-xs px-4 py-2 rounded border border-gray-700 transition-colors shadow-lg"
        >
          Upload Image
        </button>
        {originalImage && (
            <button 
              onClick={onClear}
              className="bg-red-900/30 hover:bg-red-900/50 text-red-400 text-xs px-3 py-2 rounded border border-red-900/50 transition-colors shadow-lg flex items-center gap-1"
              title="Eject Image"
            >
              <TrashIcon />
            </button>
        )}
        <input 
          type="file" 
          ref={fileInputRef} 
          className="hidden" 
          accept="image/png, image/jpeg, image/webp, image/gif, image/svg+xml, image/bmp"
          onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])}
        />
      </div>

      <div className="relative shadow-2xl shadow-black border border-gray-800">
        <canvas 
            ref={canvasRef} 
            className="max-w-full max-h-[80vh] object-contain block"
            style={{ imageRendering: 'pixelated' }} // Optional style
        />
        {isProcessing && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center backdrop-blur-[1px]">
                <div className="w-8 h-8 border-2 border-science-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        )}
      </div>

      {!originalImage && (
        <div className="text-gray-500 text-sm mt-4 font-mono">
          Drag & Drop an image to start
        </div>
      )}
    </div>
  );
};

export default Viewport;
