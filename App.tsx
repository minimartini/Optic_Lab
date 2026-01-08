
import React, { useState, useEffect, useCallback, useRef } from 'react';
import ControlPanel from './components/ControlPanel';
import Viewport from './components/Viewport';
import { CameraConfig, ApertureConfig, ApertureType, SimulationResult } from './types';
import { calculatePhysics, DEFAULT_WAVELENGTH } from './utils/physics';
import { generateLightSourceImage } from './utils/imageProcessing';

// --- EMBEDDED WORKER CODE: WEBGPU & ASM PHYSICS ---
const WORKER_CODE = `
// --- PHYSICS CONSTANTS & ENUMS ---
const ApertureType = {
  PINHOLE: 'PINHOLE', ZONE_PLATE: 'ZONE_PLATE', PHOTON_SIEVE: 'PHOTON_SIEVE',
  SLIT: 'SLIT', CROSS: 'CROSS', SLIT_ARRAY: 'SLIT_ARRAY', RANDOM: 'RANDOM', ANNULAR: 'ANNULAR',
  MULTI_DOT: 'MULTI_DOT', STAR: 'STAR', WAVES: 'WAVES', YIN_YANG: 'YIN_YANG',
  URA: 'URA', FREEFORM: 'FREEFORM', FIBONACCI: 'FIBONACCI', FRACTAL: 'FRACTAL',
  SIERPINSKI_TRIANGLE: 'SIERPINSKI_TRIANGLE', LITHO_OPC: 'LITHO_OPC', CUSTOM: 'CUSTOM'
};

const PHYSICS_CONSTANTS = {
  WAVELENGTH_TO_MM: 1e-6,
  RGB_WAVELENGTHS: [640, 540, 460] 
};

// --- FFT LIBRARY (JS CPU) ---
class ComplexArray {
    constructor(n) {
        this.n = n;
        this.real = new Float32Array(n);
        this.imag = new Float32Array(n);
    }
}

const FFT = {
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
    fftShift: (cArr, w, h) => {
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

// --- ASM PHYSICS KERNEL GENERATOR ---
const generateFresnelKernel = (camera, aperture, wavelength, pixelsPerMm, maskBitmap) => {
    const lambdaMm = wavelength * PHYSICS_CONSTANTS.WAVELENGTH_TO_MM;
    const z = camera.focalLength;
    
    // Determine smallest feature size to set correct Diffraction Window
    // If we use 'diameter' for slits (length), the window is too small, aliasing the diffraction pattern.
    let featureSize = aperture.diameter;
    if ([ApertureType.SLIT, ApertureType.CROSS, ApertureType.SLIT_ARRAY, ApertureType.WAVES, ApertureType.YIN_YANG, ApertureType.LITHO_OPC].includes(aperture.type)) {
        featureSize = aperture.slitWidth || 0.1;
    } else if (aperture.type === ApertureType.URA) {
        featureSize = (aperture.diameter / (aperture.uraRank || 13));
    }

    // Determine Simulation Window
    // 40x buffer for diffraction spread based on smallest feature
    const diffractiveSize = (40 * lambdaMm * z) / (featureSize || 0.1); 
    
    // Geometric footprint
    let geometricSize = (aperture.diameter || 1.0) * 1.5;
    if (aperture.type === ApertureType.SLIT_ARRAY) {
       geometricSize = ((aperture.count || 2) * (aperture.spread || 1.0)) * 1.5 + (aperture.diameter);
    }

    const physSize = Math.max(geometricSize, diffractiveSize); 
    
    // Increased Resolution for better Geometric fidelity
    let N = 256; 
    const reqRes = physSize * pixelsPerMm;
    if (reqRes > 256) N = 512;
    if (reqRes > 512) N = 1024;
    // Cap at 2048 for GPU memory safety
    if (reqRes > 1024) N = 2048; 
    
    // 1. Draw Aperture
    const canvas = new OffscreenCanvas(N, N);
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#000'; ctx.fillRect(0,0,N,N);
    const simPixelsPerMm = N / physSize;
    ctx.translate(N/2, N/2);
    
    drawAperture(ctx, simPixelsPerMm, aperture, wavelength, z, maskBitmap, true);
    
    ctx.translate(-N/2, -N/2);
    const imgData = ctx.getImageData(0,0,N,N).data;
    
    // 2. Init Field
    const field = new ComplexArray(N*N);
    let totalIntensity = 0;
    for(let i=0; i<N*N; i++) {
        const val = imgData[i*4] / 255.0;
        field.real[i] = val; 
        totalIntensity += val;
    }

    if (!aperture.renderDiffraction) {
         return { data: imgData, sum: Math.max(1, totalIntensity), width: N, height: N };
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

    // 4. Output Packing
    const output = new Uint8Array(N*N*4);
    let totalEnergy = 0;
    let maxVal = 0;
    
    const intensityMap = new Float32Array(N*N);
    for(let i=0; i<N*N; i++) {
        const magSq = field.real[i]**2 + field.imag[i]**2;
        intensityMap[i] = magSq;
        if(magSq > maxVal) maxVal = magSq;
        totalEnergy += magSq;
    }
    
    if (maxVal === 0) maxVal = 1;
    
    // We normalize to ensure that if we sum up all linear values in the texture, we get the total energy ratio.
    let shaderSum = 0;
    for(let i=0; i<N*N; i++) {
        const val = intensityMap[i];
        const norm = val / maxVal;
        shaderSum += norm; 
        
        // Gamma 2.2 Encode for 8-bit Texture
        const gammaVal = Math.pow(norm, 1.0/2.2);
        const v8 = Math.min(255, Math.floor(gammaVal * 255));
        output[i*4] = v8; output[i*4+1] = v8; output[i*4+2] = v8; output[i*4+3] = 255;
    }
    
    if(shaderSum === 0) shaderSum = 1;

    return { data: output, sum: shaderSum, width: N, height: N };
};

// --- WEBGPU RENDERER ---
class WebGPURenderer {
    constructor() {
        this.device = null;
        this.context = null;
        this.pipelines = {};
    }

    async init(width, height) {
        if (!navigator.gpu) throw new Error("WebGPU not supported.");
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("No WebGPU adapter found.");
        this.device = await adapter.requestDevice();

        this.canvas = new OffscreenCanvas(width, height);
        this.context = this.canvas.getContext('webgpu');
        this.presentationFormat = navigator.gpu.getPreferredCanvasFormat();
        
        this.context.configure({
            device: this.device,
            format: this.presentationFormat,
            alphaMode: 'premultiplied',
        });

        this.width = width;
        this.height = height;
        
        this.accumulationTexture = this.device.createTexture({
            size: [width, height],
            format: 'rgba16float',
            usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING
        });

        this.linearSampler = this.device.createSampler({
            magFilter: 'linear', minFilter: 'linear',
        });

        await this.initPipelines();
    }

    async initPipelines() {
        const device = this.device;

        // PIPELINE 1: SPLATTING (Scatter)
        const splatModule = device.createShaderModule({
            code: \`
            struct Uniforms {
                imgSize : vec2<f32>,
                kernelSize : f32,
                exposure : f32,
                channel : vec3<f32>,
            };
            @group(0) @binding(0) var<uniform> u : Uniforms;
            @group(0) @binding(1) var srcTex : texture_2d<f32>;
            @group(0) @binding(2) var kernelTex : texture_2d<f32>;
            @group(0) @binding(3) var mySampler : sampler;

            struct VertexOutput {
                @builtin(position) Position : vec4<f32>,
                @location(0) uv : vec2<f32>,
                @location(1) intensity : f32,
            };

            @vertex
            fn vert(@builtin(vertex_index) vIdx : u32, @builtin(instance_index) iIdx : u32) -> VertexOutput {
                var output : VertexOutput;
                let w = u32(u.imgSize.x);
                let srcX = iIdx % w;
                let srcY = iIdx / w;
                let srcColor = textureLoad(srcTex, vec2<i32>(i32(srcX), i32(srcY)), 0);
                let intensity = dot(srcColor.rgb, u.channel); 

                if (intensity < 0.001) {
                    output.Position = vec4<f32>(0.0);
                    return output;
                }

                var pos = vec2<f32>(0.0);
                if (vIdx == 0u) { pos = vec2<f32>(-1.0, -1.0); output.uv = vec2<f32>(0.0, 1.0); }
                else if (vIdx == 1u) { pos = vec2<f32>( 1.0, -1.0); output.uv = vec2<f32>(1.0, 1.0); }
                else if (vIdx == 2u) { pos = vec2<f32>(-1.0,  1.0); output.uv = vec2<f32>(0.0, 0.0); }
                else if (vIdx == 3u) { pos = vec2<f32>(-1.0,  1.0); output.uv = vec2<f32>(0.0, 0.0); }
                else if (vIdx == 4u) { pos = vec2<f32>( 1.0, -1.0); output.uv = vec2<f32>(1.0, 1.0); }
                else if (vIdx == 5u) { pos = vec2<f32>( 1.0,  1.0); output.uv = vec2<f32>(1.0, 0.0); }

                let kernelScale = (u.kernelSize / u.imgSize) * 2.0; 
                let pixelPosNDC = (vec2<f32>(f32(srcX)+0.5, f32(srcY)+0.5) / u.imgSize) * 2.0 - 1.0;
                let finalPos = pixelPosNDC + pos * kernelScale * 0.5;
                
                output.Position = vec4<f32>(finalPos.x, -finalPos.y, 0.0, 1.0);
                output.intensity = intensity;
                return output;
            }

            @fragment
            fn frag(@location(0) uv : vec2<f32>, @location(1) intensity : f32) -> @location(0) vec4<f32> {
                let kRaw = textureSample(kernelTex, mySampler, uv).r;
                let kLin = pow(kRaw, 2.2); 
                let val = kLin * intensity * u.exposure;
                return vec4<f32>(val * u.channel, 1.0); 
            }
            \`
        });

        this.pipelines.splat = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: splatModule, entryPoint: 'vert' },
            fragment: {
                module: splatModule, entryPoint: 'frag',
                targets: [{
                    format: 'rgba16float',
                    blend: {
                        color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
                        alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' }
                    }
                }]
            }
        });

        // PIPELINE 2: COMPOSITE (Tone Mapping)
        const compModule = device.createShaderModule({
            code: \`
            @group(0) @binding(0) var accTex : texture_2d<f32>;
            @group(0) @binding(1) var mySampler : sampler;

            struct VertexOutput {
                @builtin(position) Position : vec4<f32>,
                @location(0) uv : vec2<f32>,
            };

            @vertex
            fn vert(@builtin(vertex_index) vIdx : u32) -> VertexOutput {
                var pos = vec2<f32>(0.0);
                var uv = vec2<f32>(0.0);
                if (vIdx == 0u) { pos = vec2<f32>(-1.0, -1.0); uv = vec2<f32>(0.0, 1.0); } 
                else if (vIdx == 1u) { pos = vec2<f32>( 3.0, -1.0); uv = vec2<f32>(2.0, 1.0); } 
                else if (vIdx == 2u) { pos = vec2<f32>(-1.0,  3.0); uv = vec2<f32>(0.0, -1.0); } 
                var out : VertexOutput;
                out.Position = vec4<f32>(pos, 0.0, 1.0);
                out.uv = uv;
                return out;
            }

            // ACES Tone Mapping
            fn aces(x: vec3<f32>) -> vec3<f32> {
                let a = 2.51;
                let b = 0.03;
                let c = 2.43;
                let d = 0.59;
                let e = 0.14;
                return clamp((x * (a * x + b)) / (x * (c * x + d) + e), vec3<f32>(0.0), vec3<f32>(1.0));
            }

            @fragment
            fn frag(@location(0) uv : vec2<f32>) -> @location(0) vec4<f32> {
                let hdrColor = textureSample(accTex, mySampler, uv).rgb;
                
                // Apply ACES Filmic Tone Mapping to handle high dynamic range without hard clipping
                let mapped = aces(hdrColor);
                
                // Gamma 2.2 Correction
                let gamma = pow(mapped, vec3<f32>(1.0/2.2));
                
                let noise = fract(sin(dot(uv, vec2<f32>(12.9898, 78.233))) * 43758.5453) / 255.0;
                
                return vec4<f32>(gamma + noise, 1.0);
            }
            \`
        });

        this.pipelines.composite = device.createRenderPipeline({
            layout: 'auto',
            vertex: { module: compModule, entryPoint: 'vert' },
            fragment: {
                module: compModule, entryPoint: 'frag',
                targets: [{ format: this.presentationFormat }]
            }
        });
    }

    render(srcData, kernels, exposure) {
        const device = this.device;
        const w = this.width;
        const h = this.height;

        const srcTexture = device.createTexture({
            size: [w, h], format: 'rgba8unorm',
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
        });
        device.queue.writeTexture({ texture: srcTexture }, srcData, { bytesPerRow: w * 4 }, { width: w, height: h });

        const encoder = device.createCommandEncoder();
        
        const channels = [[1,0,0], [0,1,0], [0,0,1]];
        const useKernels = [kernels[0], kernels.length > 1 ? kernels[1] : kernels[0], kernels.length > 1 ? kernels[2] : kernels[0]];

        const passEncoder = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.accumulationTexture.createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear', storeOp: 'store'
            }]
        });

        passEncoder.setPipeline(this.pipelines.splat);

        const bindGroupLayout = this.pipelines.splat.getBindGroupLayout(0);

        useKernels.forEach((kObj, i) => {
            if(!kObj) return;

            const kTex = device.createTexture({
                size: [kObj.width, kObj.height], format: 'rgba8unorm',
                usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST
            });
            device.queue.writeTexture({ texture: kTex }, kObj.data, { bytesPerRow: kObj.width * 4 }, { width: kObj.width, height: kObj.height });

            // Normalize exposure by the sum of kernel intensities.
            // Shader Sum is calculated in generateFresnelKernel.
            // This ensures that energy is conserved relative to the input image brightness.
            const normExposure = (exposure / (kObj.sum || 1.0)); 

            const uniformData = new Float32Array([
                w, h,                   
                kObj.width,             
                normExposure,           
                channels[i][0], channels[i][1], channels[i][2], 0 
            ]);
            
            const uBuffer = device.createBuffer({
                size: uniformData.byteLength, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
            });
            device.queue.writeBuffer(uBuffer, 0, uniformData);

            const bindGroup = device.createBindGroup({
                layout: bindGroupLayout,
                entries: [
                    { binding: 0, resource: { buffer: uBuffer } },
                    { binding: 1, resource: srcTexture.createView() },
                    { binding: 2, resource: kTex.createView() },
                    { binding: 3, resource: this.linearSampler }
                ]
            });

            passEncoder.setBindGroup(0, bindGroup);
            passEncoder.draw(6, w * h, 0, 0); 
        });

        passEncoder.end();

        const compPass = encoder.beginRenderPass({
            colorAttachments: [{
                view: this.context.getCurrentTexture().createView(),
                clearValue: { r: 0, g: 0, b: 0, a: 1 },
                loadOp: 'clear', storeOp: 'store'
            }]
        });

        compPass.setPipeline(this.pipelines.composite);
        const compBG = device.createBindGroup({
            layout: this.pipelines.composite.getBindGroupLayout(0),
            entries: [
                { binding: 0, resource: this.accumulationTexture.createView() },
                { binding: 1, resource: this.linearSampler }
            ]
        });
        compPass.setBindGroup(0, compBG);
        compPass.draw(3, 1, 0, 0);
        compPass.end();

        device.queue.submit([encoder.finish()]);

        return this.canvas.transferToImageBitmap();
    }
}

// --- UTILITIES (Shared) ---
const drawAperture = (ctx, scale, aperture, wavelength, focalLength, maskBitmap, isSimulation) => {
  ctx.save();
  ctx.rotate((aperture.rotation || 0) * Math.PI / 180);
  const lambda = wavelength * PHYSICS_CONSTANTS.WAVELENGTH_TO_MM;
  const radiusPx = (aperture.diameter * scale) / 2;
  ctx.fillStyle = '#fff';
  
  // CRITICAL: Ensure minimum size for simulation to prevent aliasing dropout for slits/pinholes
  // 1.5px ensures at least some pixels are hit on the grid
  const minSize = isSimulation ? 1.5 : 0; 
  
  let seed = aperture.seed || 12345;
  const random = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };

  const type = aperture.type;
  
  if(type === ApertureType.PINHOLE) { 
      const r = Math.max(minSize, radiusPx);
      ctx.beginPath(); ctx.arc(0,0, r, 0,Math.PI*2); ctx.fill(); 
  }
  else if(type === ApertureType.CUSTOM && maskBitmap) { 
      const d = aperture.diameter*scale; 
      if (d < minSize*2) { ctx.beginPath(); ctx.arc(0,0, minSize, 0, Math.PI*2); ctx.fill(); } 
      else { ctx.drawImage(maskBitmap, -d/2, -d/2, d, d); }
  }
  else if(type === ApertureType.URA) {
     const rank = aperture.uraRank || 13;
     const cellSize = (aperture.diameter * scale) / rank;
     // Helper for URA (Replicated from main thread logic)
     const isQR = (n, m) => { if (n===0) return 0; for(let x=1;x<m;x++) if((x*x)%m===n) return 1; return -1; };
     const offset = (aperture.diameter * scale)/2;
     for(let i=0; i<rank; i++) {
         for(let j=0; j<rank; j++) {
             let val = 0;
             if (i===0) val=0; else if(j===0) val=1; else val=(isQR(i,rank)*isQR(j,rank)===1)?1:0;
             if(val===1) ctx.fillRect(j*cellSize - offset, i*cellSize - offset, cellSize, cellSize);
         }
     }
  }
  else if(type === ApertureType.LITHO_OPC) {
      const cd = (aperture.diameter || 1.0) * scale;
      const height = cd * 5; 
      ctx.fillRect(-cd/2, -height/2, cd, height);
      const srafWidth = Math.max(minSize, (aperture.slitWidth || cd*0.25) * scale);
      const srafDist = (aperture.spread || 1.0) * scale; 
      const leftX = -cd/2 - srafDist - srafWidth;
      const rightX = cd/2 + srafDist;
      ctx.fillRect(leftX, -height/2, srafWidth, height);
      ctx.fillRect(rightX, -height/2, srafWidth, height);
  }
  else if(type === ApertureType.SLIT_ARRAY) {
       // Young's Double Slit / Diffraction Grating
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
  else if(type === ApertureType.SLIT) {
      const w = Math.max(minSize, (aperture.slitWidth || 0.2) * scale);
      const h = (aperture.diameter || 5.0) * scale;
      ctx.fillRect(-h/2, -w/2, h, w);
  }
  else if(type === ApertureType.CROSS) {
      const w = Math.max(minSize, (aperture.slitWidth || 0.5) * scale);
      const len = (aperture.diameter) * scale; 
      ctx.fillRect(-w/2, -len/2, w, len);
      ctx.fillRect(-len/2, -w/2, len, w);
  }
  else if(type === ApertureType.ZONE_PLATE) {
      const maxN = Math.floor(Math.pow(aperture.diameter/2, 2) / (lambda * focalLength));
      if (aperture.zonePlateProfile === 'SINUSOIDAL') {
          // Approximate Newton's Rings / Sinusoidal Zone Plate
          const maxR = (aperture.diameter * scale) / 2;
          const stepSize = 0.5; // px
          for(let r=0; r<maxR; r+=stepSize) {
               const r_mm = r / scale;
               const phase = (Math.PI * r_mm * r_mm) / (lambda * focalLength);
               const transmission = (1 + Math.cos(phase)) / 2;
               ctx.beginPath();
               ctx.arc(0, 0, r, 0, Math.PI*2);
               ctx.strokeStyle = \`rgba(255, 255, 255, \${transmission})\`;
               ctx.lineWidth = stepSize + 0.1;
               ctx.stroke();
          }
      } else {
          for (let n = Math.max(1, maxN); n >= 1; n--) {
            const r_px = Math.sqrt(n * lambda * focalLength) * scale;
            ctx.beginPath(); ctx.arc(0, 0, r_px, 0, Math.PI * 2);
            ctx.fillStyle = n % 2 === 1 ? '#fff' : '#000';
            ctx.fill();
          }
      }
  }
  else {
      // Fallback to simple circle for others in worker to save space
      const r = Math.max(minSize, radiusPx);
      ctx.beginPath(); ctx.arc(0,0,r,0,Math.PI*2); ctx.fill(); 
  }
  ctx.restore();
};

// --- WORKER MESSAGE HANDLER ---
let renderer = null;

self.onmessage = async (e) => {
  const { camera, aperture, imageData, exposure, maskBitmap } = e.data;
  
  try {
      // Increased Resolution for Physics Accuracy
      const processingWidth = 1024; 
      let w = imageData.width;
      let h = imageData.height;
      
      if (w > processingWidth) {
          const scale = processingWidth / w;
          w = processingWidth;
          h = Math.round(imageData.height * scale);
      }
      
      const tempC = new OffscreenCanvas(w, h);
      const tempCtx = tempC.getContext('2d');
      tempCtx.fillStyle = '#000'; tempCtx.fillRect(0,0,w,h);
      
      if (w !== imageData.width) {
         const bmp = await createImageBitmap(imageData);
         tempCtx.drawImage(bmp, 0, 0, w, h);
         bmp.close();
      } else {
         tempCtx.putImageData(imageData, 0, 0);
      }

      const resizedData = tempCtx.getImageData(0,0,w,h).data;
      const pixelsPerMm = w / camera.sensorWidth;

      const kernels = [];
      const wavelengths = aperture.usePolychromatic ? PHYSICS_CONSTANTS.RGB_WAVELENGTHS : [camera.wavelength];
      
      wavelengths.forEach(wl => {
          const kObj = generateFresnelKernel(camera, aperture, wl, pixelsPerMm, maskBitmap);
          kernels.push(kObj);
      });

      if (!renderer) {
          renderer = new WebGPURenderer();
          await renderer.init(w, h);
      } else if (renderer.width !== w || renderer.height !== h) {
          // Re-init if size changes
          renderer = new WebGPURenderer();
          await renderer.init(w, h);
      }

      const resultBitmap = renderer.render(resizedData, kernels, exposure);

      self.postMessage({ success: true, processed: resultBitmap }, [resultBitmap]);
      
  } catch (err) {
    self.postMessage({ success: false, error: err.toString() });
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

  const workerRef = useRef<Worker | null>(null);

  const createWorker = () => {
      const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
      const workerUrl = URL.createObjectURL(blob);
      const worker = new Worker(workerUrl);
      
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
      
      return { worker, url: workerUrl };
  };

  useEffect(() => {
    const { worker, url } = createWorker();
    workerRef.current = worker;

    return () => {
        worker.terminate();
        URL.revokeObjectURL(url);
    };
  }, []);

  const terminateWorker = () => {
      if (workerRef.current) {
          workerRef.current.terminate();
      }
      setIsProcessing(false);
      const { worker, url } = createWorker();
      workerRef.current = worker;
  };

  useEffect(() => {
    setSimResult(calculatePhysics(camera, aperture));
  }, [camera, aperture]);

  const runSimulation = useCallback(async () => {
    if (!workerRef.current) return;
    setIsProcessing(true);

    let input = uploadedImage;
    let effectiveExposure = exposure; 

    // Auto Exposure / Gain Logic
    if (input) {
        // For uploaded images, we treat the image as "Properly Exposed Scene".
        // The simulation kernel is normalized to conserve energy (sum=1.0).
        // Therefore, we do NOT want to apply the massive f-stop gain, otherwise it blows out white.
        // We just apply the user's manual exposure slider (default 1.0).
        effectiveExposure = exposure; 
    } else {
        // Point Source Mode (Synthetic)
        // Here we are simulating a tiny point of light.
        // We apply a moderate gain to make the diffraction pattern visible, but not the massive f-stop gain.
        input = generateLightSourceImage(1200, 1200, 0.15, camera.sensorWidth);
        effectiveExposure = exposure * 50.0; // Boost visibility of diffraction fringes
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
