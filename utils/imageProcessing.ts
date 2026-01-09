
export const applyVignetting = (data: ImageData, focalLengthMm: number, sensorWidthMm: number) => {
    const { width, height, data: pixels } = data;
    const pixelsPerMm = width / sensorWidthMm;
    const centerX = width / 2;
    const centerY = height / 2;
    const f2 = focalLengthMm * focalLengthMm;

    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const dx = (x - centerX) / pixelsPerMm;
            const dy = (y - centerY) / pixelsPerMm;
            const r2 = dx * dx + dy * dy;
            
            // CORRECT COS^4 LAW
            // Intensity ~ cos^4(theta) where tan(theta) = r/f
            const cosTheta = focalLengthMm / Math.sqrt(f2 + r2);
            const cos4 = Math.pow(cosTheta, 4);
            
            const idx = (y * width + x) * 4;
            // Apply vignetting (multiply existing RGB values)
            pixels[idx] *= cos4;
            pixels[idx + 1] *= cos4;
            pixels[idx + 2] *= cos4;
        }
    }
};

export const applySensorNoise = (data: ImageData, iso: number) => {
    const pixels = data.data;
    const noiseAmount = (iso / 3200) * 15;
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i+3] === 0) continue;
        const noise = (Math.random() - 0.5) * noiseAmount;
        pixels[i] = Math.min(255, Math.max(0, pixels[i] + noise));
        pixels[i+1] = Math.min(255, Math.max(0, pixels[i+1] + noise));
        pixels[i+2] = Math.min(255, Math.max(0, pixels[i+2] + noise));
    }
};

export const convolveImageRGB = (
  source: ImageData,
  kernels: Float32Array[],
  exposure: number = 1.0
): ImageData => {
    // Legacy function stub - logic moved to worker for performance
    return source; 
};

export const resizeImageData = (input: ImageData, targetWidth: number): ImageData => {
    const scale = targetWidth / input.width;
    const targetHeight = Math.round(input.height * scale);

    if (typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(targetWidth, targetHeight);
        const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        
        const srcCanvas = new OffscreenCanvas(input.width, input.height);
        const srcCtx = srcCanvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        srcCtx.putImageData(input, 0, 0);

        ctx.drawImage(srcCanvas, 0, 0, targetWidth, targetHeight);
        return ctx.getImageData(0, 0, targetWidth, targetHeight);
    } 
    
    if (typeof document !== 'undefined') {
        const canvas = document.createElement('canvas');
        canvas.width = targetWidth; canvas.height = targetHeight;
        const ctx = canvas.getContext('2d')!;
        
        const temp = document.createElement('canvas');
        temp.width = input.width; temp.height = input.height;
        temp.getContext('2d')!.putImageData(input, 0, 0);
        
        ctx.drawImage(temp, 0, 0, targetWidth, targetHeight);
        return ctx.getImageData(0, 0, targetWidth, targetHeight);
    }

    throw new Error("Environment does not support Canvas");
};

export const generateLightSourceImage = (w: number, h: number, dMm: number, sWMm: number): ImageData => {
    // Determine the size of the point source on the sensor
    const pxMm = w / sWMm;
    const pointRadPx = (dMm / 2) * pxMm;
    
    // Create a new blank image
    if (typeof document === 'undefined' && typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        ctx.fillStyle = '#000'; ctx.fillRect(0,0,w,h);
        ctx.beginPath(); 
        // Ensure at least 1px dot
        ctx.arc(w/2, h/2, Math.max(0.5, pointRadPx), 0, Math.PI*2);
        ctx.fillStyle = '#fff'; ctx.fill();
        return ctx.getImageData(0,0,w,h);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,w,h);
    ctx.beginPath(); 
    ctx.arc(w/2, h/2, Math.max(0.5, pointRadPx), 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
    return ctx.getImageData(0,0,w,h);
};
