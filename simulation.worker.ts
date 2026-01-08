
import { generateKernel, PHYSICS_CONSTANTS } from './utils/physics';
import { convolveImageRGB, applyVignetting, applySensorNoise, resizeImageData } from './utils/imageProcessing';

self.onmessage = (e: MessageEvent) => {
  const { camera, aperture, imageData, exposure } = e.data;
  
  try {
    let simInput = imageData;
    const processingWidth = 600; 
    if (imageData.width > processingWidth) {
        simInput = resizeImageData(imageData, processingWidth);
    }

    const pixelsPerMm = simInput.width / camera.sensorWidth;
    const kernels: Float32Array[] = [];

    if (aperture.usePolychromatic) {
        PHYSICS_CONSTANTS.RGB_WAVELENGTHS.forEach(wl => {
            kernels.push(generateKernel(camera, aperture, wl, pixelsPerMm));
        });
    } else {
        kernels.push(generateKernel(camera, aperture, camera.wavelength, pixelsPerMm));
    }

    let processed = convolveImageRGB(simInput, kernels, exposure);

    if (aperture.useVignetting) {
        applyVignetting(processed, camera.focalLength, camera.sensorWidth);
    }

    if (camera.iso > 100) {
        applySensorNoise(processed, camera.iso);
    }

    self.postMessage({ success: true, processed });
  } catch (err) {
    self.postMessage({ success: false, error: err.toString() });
  }
};

export default {} as any;
