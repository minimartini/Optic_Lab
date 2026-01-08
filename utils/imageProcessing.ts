
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
            // Cosine fourth law: I = I0 * (f^2 / (f^2 + r^2))^2
            const cos4 = Math.pow(f2 / (f2 + r2), 2);
            const idx = (y * width + x) * 4;
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

// Interface for a sparse kernel point
interface KernelPoint {
    dx: number;
    dy: number;
    val: number;
}

export const convolveImageRGB = (
  source: ImageData,
  kernels: Float32Array[],
  exposure: number = 1.0
): ImageData => {
  const { width, height, data: src } = source;
  const output = new ImageData(width, height);
  const dst = output.data;
  
  const kR_raw = kernels[0];
  const kG_raw = kernels[kernels.length > 1 ? 1 : 0];
  const kB_raw = kernels[kernels.length > 1 ? 2 : 0];
  
  const kSize = Math.sqrt(kR_raw.length);
  const half = Math.floor(kSize / 2);

  // --- Optimization: Pre-calculate Sparse Kernels ---
  // Instead of iterating w*h*kSize*kSize (O(N^4)), we iterate w*h*ActiveKernelPoints.
  // For multi-dot or slits, this is a massive reduction.
  
  const toSparse = (raw: Float32Array): KernelPoint[] => {
      const points: KernelPoint[] = [];
      const threshold = 0.00001; // Ignore effectively zero contributions
      for (let y = 0; y < kSize; y++) {
          for (let x = 0; x < kSize; x++) {
              const val = raw[y * kSize + x];
              if (val > threshold) {
                  points.push({ dx: x - half, dy: y - half, val });
              }
          }
      }
      return points;
  };

  const kR = toSparse(kR_raw);
  // Optimization: If monochrome (1 kernel), reuse the sparse array
  const isMono = kernels.length === 1;
  const kG = isMono ? kR : toSparse(kG_raw);
  const kB = isMono ? kR : toSparse(kB_raw);

  // Flattened access for performance
  const lenR = kR.length;
  const lenG = kG.length;
  const lenB = kB.length;

  for (let y = 0; y < height; y++) {
    // Pre-calculate row offset
    const rowOffset = y * width;
    
    for (let x = 0; x < width; x++) {
      let r = 0, g = 0, b = 0;

      // Red Channel Convolution
      for (let i = 0; i < lenR; i++) {
          const kp = kR[i];
          const sx = x + kp.dx;
          const sy = y + kp.dy;
          
          // Boundary check
          if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
              const sidx = (sy * width + sx) * 4;
              r += src[sidx] * kp.val;
          }
      }

      // Green Channel
      for (let i = 0; i < lenG; i++) {
          const kp = kG[i];
          const sx = x + kp.dx;
          const sy = y + kp.dy;
          if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
              const sidx = (sy * width + sx) * 4;
              g += src[sidx + 1] * kp.val;
          }
      }

      // Blue Channel
      for (let i = 0; i < lenB; i++) {
          const kp = kB[i];
          const sx = x + kp.dx;
          const sy = y + kp.dy;
          if (sx >= 0 && sx < width && sy >= 0 && sy < height) {
              const sidx = (sy * width + sx) * 4;
              b += src[sidx + 2] * kp.val;
          }
      }

      const didx = (rowOffset + x) * 4;
      dst[didx] = Math.min(255, r * exposure);
      dst[didx+1] = Math.min(255, g * exposure);
      dst[didx+2] = Math.min(255, b * exposure);
      dst[didx+3] = 255;
    }
  }
  return output;
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
    
    // Fallback for Main Thread only
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

    throw new Error("Environment does not support Canvas (OffscreenCanvas or DOM)");
};

export const generateLightSourceImage = (w: number, h: number, dMm: number, sWMm: number): ImageData => {
    // Note: This function runs on the main thread in App.tsx, so document.createElement is fine.
    // However, if moved to worker, it would need updating.
    if (typeof document === 'undefined' && typeof OffscreenCanvas !== 'undefined') {
        const canvas = new OffscreenCanvas(w, h);
        const ctx = canvas.getContext('2d') as OffscreenCanvasRenderingContext2D;
        ctx.fillStyle = '#000'; ctx.fillRect(0,0,w,h);
        const pxMm = w / sWMm;
        ctx.beginPath(); ctx.arc(w/2, h/2, Math.max(1, (dMm/2)*pxMm), 0, Math.PI*2);
        ctx.fillStyle = '#fff'; ctx.fill();
        return ctx.getImageData(0,0,w,h);
    }

    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,w,h);
    const pxMm = w / sWMm;
    ctx.beginPath(); ctx.arc(w/2, h/2, Math.max(1, (dMm/2)*pxMm), 0, Math.PI*2);
    ctx.fillStyle = '#fff'; ctx.fill();
    return ctx.getImageData(0,0,w,h);
};
