
import React, { useState, useEffect, useRef } from 'react';
import { CameraConfig, ApertureConfig, ApertureType, SimulationResult, CAMERA_PRESETS, MultiDotPattern } from '../types';
import { PHYSICS_CONSTANTS } from '../utils/physics';
import AperturePreview from './AperturePreview';

interface ControlPanelProps {
  camera: CameraConfig;
  setCamera: React.Dispatch<React.SetStateAction<CameraConfig>>;
  aperture: ApertureConfig;
  setAperture: React.Dispatch<React.SetStateAction<ApertureConfig>>;
  simResult: SimulationResult;
  isProcessing: boolean;
  onSimulate: () => void;
  onCancel: () => void; 
  exposure: number;
  setExposure: (n: number) => void;
}

// Icons
const ChevronDown = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
const ChevronUp = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>;
const CameraIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const ApertureIcon = () => <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; 
const FilmIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>;
const TimerIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const DesignIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>;
const UploadIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>;
const ClipboardIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;

const ControlPanel: React.FC<ControlPanelProps> = ({
  camera, setCamera, aperture, setAperture, simResult, isProcessing, onSimulate, onCancel, exposure, setExposure
}) => {
  const [isCameraOpen, setIsCameraOpen] = useState(true);
  const [isExpCalcOpen, setIsExpCalcOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Exposure Calculator State
  const [meterF, setMeterF] = useState(8); 
  const [meterT, setMeterT] = useState(125); 
  const [meterIso, setMeterIso] = useState(100);
  const [calculatedTime, setCalculatedTime] = useState("");
  const [targetEquiv, setTargetEquiv] = useState(35); 

  const updateCam = (k: keyof CameraConfig, v: any) => setCamera(p => ({ ...p, [k]: v }));
  const updateAp = (k: keyof ApertureConfig, v: any) => setAperture(p => ({ ...p, [k]: v }));

  const handlePresetChange = (id: string) => {
    const p = CAMERA_PRESETS.find(x => x.id === id);
    if (p) {
        setCamera(prev => ({ 
            ...prev, 
            modelName: p.id,
            focalLength: Math.max(p.flange + 10, prev.focalLength), 
            sensorWidth: p.sensorW, 
            sensorHeight: p.sensorH,
            flangeDistance: p.flange 
        }));
    }
  };

  const handleMaskUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = (evt) => {
          if (evt.target?.result) {
              updateAp('maskImage', evt.target.result as string);
          }
      };
      reader.readAsDataURL(file);
  };

  const handlePaste = async () => {
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        if (item.types.some(type => type.startsWith('image/'))) {
          const blob = await item.getType(item.types.find(type => type.startsWith('image/'))!);
          const reader = new FileReader();
          reader.onload = (e) => {
             if(e.target?.result) updateAp('maskImage', e.target.result as string);
          };
          reader.readAsDataURL(blob);
          return;
        }
      }
      alert("No image found on clipboard");
    } catch (err) {
      console.error(err);
      alert("Failed to access clipboard. Check permissions.");
    }
  };

  // Logic to calculate optimized double slit parameters
  const optimizeDoubleSlit = () => {
      // 1. Slit Width (a): Small enough to have a wide diffraction envelope.
      // a ~ sqrt(lambda * f) is a bit large, usually we want smaller.
      // Let's pick 0.05mm - 0.1mm which is standard for laser experiments.
      const optimalWidth = 0.08; 
      
      // 2. Separation (d): Controls fringe spacing (x = lambda * f / d).
      // We want x to be around 0.2mm to be visible on a sensor.
      // d = lambda * f / 0.2
      const lambdaMm = (camera.wavelength || 550) * 1e-6;
      const f = camera.focalLength;
      const targetFringeSpacing = 0.3; // mm
      const optimalSeparation = (lambdaMm * f) / targetFringeSpacing;

      setAperture(prev => ({
          ...prev,
          slitWidth: optimalWidth,
          spread: parseFloat(optimalSeparation.toFixed(3)),
          diameter: 5.0, // Length
          count: 2
      }));
  };

  const isCustomCamera = camera.modelName === 'custom';
  const isFractalMode = aperture.type === ApertureType.FRACTAL || aperture.type === ApertureType.SIERPINSKI_TRIANGLE;
  const isExtendedShape = [
      ApertureType.SLIT, ApertureType.CROSS, ApertureType.WAVES, 
      ApertureType.YIN_YANG, ApertureType.LITHO_OPC, ApertureType.FREEFORM, 
      ApertureType.CUSTOM, ApertureType.URA, ApertureType.SLIT_ARRAY
  ].includes(aperture.type);

  const diag35 = 43.27;
  const diagSensor = Math.sqrt(Math.pow(camera.sensorWidth, 2) + Math.pow(camera.sensorHeight, 2));
  const cropFactor = diagSensor > 0 ? diag35 / diagSensor : 1;

  useEffect(() => {
    if (!isExpCalcOpen) return;
    const meterEv = Math.log2(Math.pow(meterF, 2) / (1/meterT));
    const isoDiff = Math.log2(camera.iso / meterIso); 
    const targetEv = meterEv + isoDiff;
    const pinholeF = simResult.fNumber;
    let timeSec = Math.pow(pinholeF, 2) / Math.pow(2, targetEv);
    let reciprocityApplied = false;
    const currentPreset = CAMERA_PRESETS.find(p => p.id === camera.modelName);
    const isFilm = currentPreset?.type === 'Film' || camera.modelName === 'custom'; 
    if (isFilm && timeSec > 1) {
        timeSec = Math.pow(timeSec, 1.3);
        reciprocityApplied = true;
    }
    let timeStr = "";
    if (timeSec < 1) { timeStr = `1/${Math.round(1/timeSec)} s`; } 
    else if (timeSec < 60) { timeStr = `${timeSec.toFixed(1)} s`; } 
    else if (timeSec < 3600) { timeStr = `${Math.floor(timeSec / 60)}m ${Math.floor(timeSec % 60)}s`; } 
    else { timeStr = `${Math.floor(timeSec / 3600)}h ${Math.floor((timeSec % 3600) / 60)}m`; }
    if (reciprocityApplied) { timeStr += " (w/ Reciprocity)"; }
    setCalculatedTime(timeStr);
  }, [isExpCalcOpen, meterF, meterT, meterIso, camera.iso, simResult.fNumber, camera.modelName]);


  const renderApertureSpecifics = () => {
    switch (aperture.type) {
      case ApertureType.ZONE_PLATE:
      case ApertureType.PHOTON_SIEVE:
        return (
          <div className="space-y-3 bg-black/40 p-3 rounded border border-gray-800 mt-3">
            <div className="space-y-1">
                <div className="flex justify-between">
                    <label className="text-gray-400 text-xs">NUMBER_OF_ZONES</label>
                    <span className="text-science-400 font-mono">{aperture.zones || 10}</span>
                </div>
                <input 
                    type="range" min="1" max="50" step="1" 
                    value={aperture.zones || 10} 
                    onChange={e => updateAp('zones', parseInt(e.target.value))} 
                    className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                />
            </div>
            {aperture.type === ApertureType.ZONE_PLATE && (
                <div className="mt-2 pt-2 border-t border-[#333]">
                    <label className="text-gray-400 text-[10px] uppercase font-bold block mb-1">Transmission Profile</label>
                    <div className="flex bg-[#111] p-0.5 rounded border border-[#333]">
                        <button 
                            onClick={() => updateAp('zonePlateProfile', 'BINARY')}
                            className={`flex-1 py-1 text-[9px] rounded ${aperture.zonePlateProfile !== 'SINUSOIDAL' ? 'bg-[#333] text-white' : 'text-gray-500'}`}
                        >
                            BINARY (Standard)
                        </button>
                        <button 
                            onClick={() => updateAp('zonePlateProfile', 'SINUSOIDAL')}
                            className={`flex-1 py-1 text-[9px] rounded ${aperture.zonePlateProfile === 'SINUSOIDAL' ? 'bg-[#333] text-white' : 'text-gray-500'}`}
                        >
                            SINUSOIDAL (Newton's)
                        </button>
                    </div>
                </div>
            )}
          </div>
        );
      case ApertureType.SLIT:
      case ApertureType.CROSS:
        return (
          <div className="space-y-3 bg-black/40 p-3 rounded border border-gray-800 mt-3">
            <div className="space-y-1">
                <div className="flex justify-between">
                    <label className="text-gray-400 text-xs">LINE THICKNESS (mm)</label>
                    <span className="text-science-400 font-mono">{aperture.slitWidth || 0.2}</span>
                </div>
                <input 
                    type="range" min="0.01" max="2.0" step="0.01" 
                    value={aperture.slitWidth || 0.2} 
                    onChange={e => updateAp('slitWidth', parseFloat(e.target.value))} 
                    className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                />
            </div>
          </div>
        );
      case ApertureType.SLIT_ARRAY:
          return (
             <div className="space-y-3 bg-black/40 p-3 rounded border border-gray-800 mt-3">
                 <div className="flex justify-between items-center">
                    <h3 className="text-[10px] text-cyan-400 font-bold">Young's Interference Setup</h3>
                    <button 
                        onClick={optimizeDoubleSlit}
                        className="text-[9px] bg-cyan-900/40 text-cyan-400 px-2 py-0.5 rounded border border-cyan-800 hover:bg-cyan-900/60"
                    >
                        AUTO-OPTIMIZE
                    </button>
                 </div>
                 
                 <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">SLIT COUNT</label>
                        <span className="text-science-400 font-mono">{aperture.count || 2}</span>
                    </div>
                    <input 
                        type="range" min="2" max="20" step="1" 
                        value={aperture.count || 2} 
                        onChange={e => updateAp('count', parseInt(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">SLIT WIDTH (mm)</label>
                        <span className="text-science-400 font-mono">{aperture.slitWidth || 0.1}</span>
                    </div>
                    <input 
                        type="range" min="0.01" max="1.0" step="0.005" 
                        value={aperture.slitWidth || 0.1} 
                        onChange={e => updateAp('slitWidth', parseFloat(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                </div>

                <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">SEPARATION (mm)</label>
                        <span className="text-science-400 font-mono">{aperture.spread || 0.5}</span>
                    </div>
                    <input 
                        type="range" min="0.05" max="5.0" step="0.05" 
                        value={aperture.spread || 0.5} 
                        onChange={e => updateAp('spread', parseFloat(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                </div>
                
                {simResult.fringeSpacing && (
                    <div className="mt-2 p-2 bg-[#222] rounded border border-[#333]">
                        <div className="flex justify-between text-[9px] text-gray-400">
                            <span>Fringe Spacing:</span>
                            <span className="text-white font-mono">{simResult.fringeSpacing.toFixed(3)} mm</span>
                        </div>
                        <div className="flex justify-between text-[9px] text-gray-400 mt-1">
                            <span>Visibility:</span>
                            <span className={simResult.interferenceRating?.includes("Strong") ? "text-green-400" : "text-yellow-400"}>
                                {simResult.interferenceRating}
                            </span>
                        </div>
                    </div>
                )}
             </div>
          );

      case ApertureType.URA:
         return (
             <div className="space-y-3 bg-black/40 p-3 rounded border border-gray-800 mt-3">
                <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">URA RANK (Prime)</label>
                        <span className="text-science-400 font-mono">{aperture.uraRank || 13}</span>
                    </div>
                    {/* Common URA Ranks */}
                    <input 
                        type="range" min="0" max="5" step="1" 
                        value={[5, 7, 11, 13, 17, 19].indexOf(aperture.uraRank || 13)}
                        onChange={e => {
                            const ranks = [5, 7, 11, 13, 17, 19];
                            updateAp('uraRank', ranks[parseInt(e.target.value)]);
                        }}
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                    <div className="flex justify-between text-[8px] text-gray-500">
                        <span>5</span><span>7</span><span>11</span><span>13</span><span>17</span><span>19</span>
                    </div>
                </div>
                <p className="text-[9px] text-gray-500 italic mt-1">
                     Uniformly Redundant Arrays allow high light throughput with recoverable detail (via deconvolution).
                 </p>
             </div>
         );

      case ApertureType.WAVES: 
      case ApertureType.YIN_YANG:
         return (
             <div className="space-y-3 bg-black/40 p-3 rounded border border-gray-800 mt-3">
                <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">LINE THICKNESS (mm)</label>
                        <span className="text-science-400 font-mono">{aperture.slitWidth || 0.1}</span>
                    </div>
                    <input 
                        type="range" min="0.01" max="1.0" step="0.01" 
                        value={aperture.slitWidth || 0.1} 
                        onChange={e => updateAp('slitWidth', parseFloat(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                </div>
                <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">WAVE AMPLITUDE (mm)</label>
                        <span className="text-science-400 font-mono">{aperture.slitHeight || 2.0}</span>
                    </div>
                    <input 
                        type="range" min="0.5" max={Math.max(10.0, diagSensor * 1.1)} step="0.1" 
                        value={aperture.slitHeight || 2.0} 
                        onChange={e => updateAp('slitHeight', parseFloat(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                </div>
                 <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">NUMBER OF WAVES</label>
                        <span className="text-science-400 font-mono">{aperture.count || 2}</span>
                    </div>
                    <input 
                        type="range" min="1" max="10" step="1" 
                        value={aperture.count || 2} 
                        onChange={e => updateAp('count', parseInt(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                </div>
                {aperture.type === ApertureType.YIN_YANG && (
                     <div className="space-y-1 pt-2 border-t border-[#333]">
                        <div className="flex justify-between">
                            <label className="text-gray-400 text-xs">CENTER DOT SIZE (mm)</label>
                            <span className="text-science-400 font-mono">{aperture.innerDiameter || 0.2}</span>
                        </div>
                        <input 
                            type="range" min="0.01" max="2.0" step="0.01" 
                            value={aperture.innerDiameter || 0.2} 
                            onChange={e => updateAp('innerDiameter', parseFloat(e.target.value))} 
                            className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                        />
                    </div>
                )}
             </div>
         );

      case ApertureType.LITHO_OPC:
        return (
             <div className="space-y-3 bg-black/40 p-3 rounded border border-gray-800 mt-3">
                 <h3 className="text-[10px] text-cyan-400 font-bold mb-2">Resolution Enhancement Tech (RET)</h3>
                 <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">MAIN FEATURE SIZE (mm)</label>
                        <span className="text-science-400 font-mono">{aperture.diameter}</span>
                    </div>
                    <input 
                        type="range" min="0.05" max="5.0" step="0.05" 
                        value={aperture.diameter} 
                        onChange={e => updateAp('diameter', parseFloat(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                 </div>
                  <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">SRAF SIZE (mm)</label>
                        <span className="text-science-400 font-mono">{aperture.slitWidth || 0.05}</span>
                    </div>
                    <input 
                        type="range" min="0.01" max="1.0" step="0.01" 
                        value={aperture.slitWidth || 0.05} 
                        onChange={e => updateAp('slitWidth', parseFloat(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                 </div>
                 <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">SRAF DISTANCE (mm)</label>
                        <span className="text-science-400 font-mono">{aperture.spread || 1.0}</span>
                    </div>
                    <input 
                        type="range" min="0.1" max="5.0" step="0.1" 
                        value={aperture.spread || 1.0} 
                        onChange={e => updateAp('spread', parseFloat(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                 </div>
                 <p className="text-[9px] text-gray-500 italic mt-1">
                     Tune SRAF Distance to see constructive interference sharpening the main bar.
                 </p>
             </div>
        );

      case ApertureType.ANNULAR:
      case ApertureType.STAR:
         return (
            <div className="space-y-3 bg-black/40 p-3 rounded border border-gray-800 mt-3">
                <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">INNER DIAMETER (mm)</label>
                        <span className="text-science-400 font-mono">{aperture.innerDiameter || aperture.diameter * 0.5}</span>
                    </div>
                    <input 
                        type="range" min="0.01" max={aperture.diameter} step="0.01" 
                        value={aperture.innerDiameter || aperture.diameter * 0.5} 
                        onChange={e => updateAp('innerDiameter', parseFloat(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                </div>
                {aperture.type === ApertureType.STAR && (
                    <div className="space-y-1">
                        <div className="flex justify-between">
                            <label className="text-gray-400 text-xs">POINTS</label>
                            <span className="text-science-400 font-mono">{aperture.spikes || 5}</span>
                        </div>
                        <input 
                            type="range" min="3" max="20" step="1" 
                            value={aperture.spikes || 5} 
                            onChange={e => updateAp('spikes', parseInt(e.target.value))} 
                            className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                        />
                    </div>
                )}
            </div>
         );

      case ApertureType.MULTI_DOT:
      case ApertureType.FIBONACCI:
      case ApertureType.RANDOM:
        return (
          <div className="space-y-3 bg-black/40 p-3 rounded border border-gray-800 mt-3">
            {aperture.type === ApertureType.MULTI_DOT && (
                <div>
                    <label className="text-gray-400 text-xs block mb-1">PATTERN</label>
                    <select 
                        className="w-full bg-[#111] border border-[#333] p-1.5 rounded text-gray-200 text-xs"
                        value={aperture.multiDotPattern}
                        onChange={(e) => updateAp('multiDotPattern', e.target.value)}
                    >
                        {Object.values(MultiDotPattern).map(p => <option key={p} value={p}>{p}</option>)}
                    </select>
                </div>
            )}
            
            <div className="space-y-1">
                <div className="flex justify-between">
                    <label className="text-gray-400 text-xs">COUNT</label>
                    <span className="text-science-400 font-mono">{aperture.count || 10}</span>
                </div>
                <input 
                    type="range" min="1" max="500" step="1" 
                    value={aperture.count || 10} 
                    onChange={e => updateAp('count', parseInt(e.target.value))} 
                    className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                />
            </div>

            <div className="space-y-1">
                <div className="flex justify-between">
                    <label className="text-gray-400 text-xs">SPREAD / EXTENT (mm)</label>
                    <span className="text-science-400 font-mono">{aperture.spread || 2.0}</span>
                </div>
                <input 
                    type="range" min="0.5" max="20.0" step="0.1" 
                    value={aperture.spread || 2.0} 
                    onChange={e => updateAp('spread', parseFloat(e.target.value))} 
                    className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                />
            </div>

             <div className="flex items-center justify-between">
                <label className="text-gray-400 text-xs">SEED</label>
                <button 
                    onClick={() => updateAp('seed', Math.floor(Math.random() * 10000))}
                    className="text-[10px] bg-[#222] px-2 py-1 rounded text-science-500 hover:bg-[#333]"
                >
                    RANDOMIZE
                </button>
            </div>
          </div>
        );

      case ApertureType.FRACTAL:
      case ApertureType.SIERPINSKI_TRIANGLE:
         return (
             <div className="space-y-3 bg-black/40 p-3 rounded border border-gray-800 mt-3">
                 <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">ITERATIONS (Complexity)</label>
                        <span className="text-science-400 font-mono">{aperture.iteration || 3}</span>
                    </div>
                    <input 
                        type="range" min="1" max="6" step="1" 
                        value={aperture.iteration || 3} 
                        onChange={e => updateAp('iteration', parseInt(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                 </div>
                 <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">SIZE / SPREAD (mm)</label>
                        <span className="text-science-400 font-mono">{aperture.spread || 5.0}</span>
                    </div>
                    <input 
                        type="range" min="1.0" max="20.0" step="0.5" 
                        value={aperture.spread || 5.0} 
                        onChange={e => updateAp('spread', parseFloat(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                 </div>
             </div>
         );
         
      case ApertureType.FREEFORM:
         return (
             <div className="space-y-3 bg-black/40 p-3 rounded border border-gray-800 mt-3">
                 <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">BRUSH SIZE (mm)</label>
                        <span className="text-science-400 font-mono">{aperture.brushSize || 0.5}</span>
                    </div>
                    <input 
                        type="range" min="0.1" max="5.0" step="0.1" 
                        value={aperture.brushSize || 0.5} 
                        onChange={e => updateAp('brushSize', parseFloat(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                 </div>
                 <div className="space-y-1">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">CANVAS SIZE (mm)</label>
                        <span className="text-science-400 font-mono">{aperture.diameter}</span>
                    </div>
                    <input 
                        type="range" min="5" max="100" step="1" 
                        value={aperture.diameter} 
                        onChange={e => updateAp('diameter', parseFloat(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                 </div>
                 <div className="flex gap-2">
                     <button 
                        onClick={() => updateAp('customPath', [])}
                        className="flex-1 bg-red-900/30 text-red-500 py-1.5 text-[10px] rounded border border-red-900/50 hover:bg-red-900/50"
                     >
                         CLEAR CANVAS
                     </button>
                     <button 
                         onClick={() => {
                             // Simple random path generator
                             const pts = [];
                             for(let i=0; i<10; i++) {
                                 pts.push({x: (Math.random()-0.5), y: (Math.random()-0.5)});
                             }
                             updateAp('customPath', pts);
                         }}
                         className="flex-1 bg-[#222] text-gray-300 py-1.5 text-[10px] rounded border border-[#333] hover:bg-[#333]"
                     >
                         RANDOMIZE
                     </button>
                 </div>
             </div>
         );

      case ApertureType.CUSTOM:
        return (
            <div className="space-y-3 bg-black/40 p-3 rounded border border-gray-800 mt-3">
                <div className="space-y-1">
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-gray-400 text-xs">MASK IMAGE</label>
                        <div className="flex gap-1">
                            <button 
                                onClick={handlePaste}
                                className="bg-[#222] text-gray-300 px-2 py-1 rounded text-[10px] border border-[#333] hover:bg-[#333] flex items-center gap-1"
                                title="Paste from Clipboard"
                            >
                                <ClipboardIcon />
                            </button>
                            <button 
                                onClick={() => fileInputRef.current?.click()}
                                className="bg-[#222] text-science-500 px-2 py-1 rounded text-[10px] border border-[#333] hover:bg-[#333] flex items-center gap-1"
                            >
                                <UploadIcon /> IMPORT
                            </button>
                        </div>
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            onChange={handleMaskUpload} 
                            className="hidden" 
                            accept="image/*"
                        />
                    </div>
                    {aperture.maskImage ? (
                        <div className="relative aspect-square w-12 bg-black border border-gray-700 rounded overflow-hidden mx-auto mb-2">
                            <img src={aperture.maskImage} className="object-cover w-full h-full opacity-70" alt="Mask" />
                        </div>
                    ) : (
                        <div className="text-[10px] text-gray-600 text-center italic mb-2">No image loaded</div>
                    )}
                </div>

                <div className="space-y-1 pt-2 border-t border-[#333]">
                    <div className="flex justify-between">
                        <label className="text-gray-400 text-xs">THRESHOLD</label>
                        <span className="text-science-400 font-mono">{aperture.maskThreshold ?? 128}</span>
                    </div>
                    <input 
                        type="range" min="0" max="255" step="1" 
                        value={aperture.maskThreshold ?? 128} 
                        onChange={e => updateAp('maskThreshold', parseInt(e.target.value))} 
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                    />
                </div>

                <label className="flex items-center gap-2 text-gray-400 cursor-pointer p-2 bg-[#161616] rounded border border-[#333] hover:bg-[#222] mt-2">
                    <input 
                        type="checkbox" 
                        checked={aperture.maskInvert || false} 
                        onChange={e => updateAp('maskInvert', e.target.checked)} 
                        className="accent-science-500" 
                    />
                    <span className="text-[10px] font-bold">INVERT MASK</span>
                </label>
            </div>
        );

      default:
        return null;
    }
  };

  const currentPresetName = CAMERA_PRESETS.find(p => p.id === camera.modelName)?.name || 'Custom Camera';
  const flangeDist = camera.flangeDistance || 0;
  const extension = Math.max(0, camera.focalLength - flangeDist);

  return (
    <div className="w-96 bg-[#0a0a0a] border-r border-[#1a1a1a] flex flex-col h-full overflow-y-auto font-sans text-sm">
      <div className="p-4 border-b border-[#1a1a1a]">
        <h1 className="text-lg font-bold text-science-500 tracking-tight italic">OPTIC_LAB <span className="text-white not-italic font-light">SIMULATOR</span></h1>
      </div>

      <div className="p-4 space-y-6">
        
        {/* --- APERTURE PLATE SECTION (REDESIGNED) --- */}
        <section className="bg-[#121212] rounded-xl border border-[#2a2a2a] p-4 shadow-xl relative overflow-hidden ring-1 ring-white/5">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-science-500 via-science-400 to-transparent opacity-80"></div>

          <div className="flex items-center gap-3 mb-4 mt-1">
             <div className="text-white bg-science-600 p-1.5 rounded-md shadow-lg shadow-science-900/50"><ApertureIcon /></div>
             <div>
                 <h2 className="text-white font-bold text-sm tracking-wide leading-none">APERTURE MODULE</h2>
                 <p className="text-[10px] text-gray-400 mt-0.5">Geometry & Mask Definition</p>
             </div>
          </div>

          <div className="mb-5 overflow-hidden rounded-lg border border-[#333] shadow-md">
             <AperturePreview aperture={aperture} camera={camera} onUpdateAperture={(u) => setAperture(p => ({...p, ...u}))} />
          </div>

          <div className="space-y-5">
            <div>
                <label className="text-science-400 text-[10px] uppercase font-bold block mb-1.5 tracking-wider">Aperture Pattern</label>
                <div className="relative group">
                    <select 
                        className="w-full bg-[#050505] border border-[#333] p-3 rounded-lg text-white text-sm outline-none focus:border-science-500 focus:ring-1 focus:ring-science-500/50 appearance-none font-medium transition-all group-hover:border-[#444]"
                        value={aperture.type}
                        onChange={(e) => updateAp('type', e.target.value as ApertureType)}
                    >
                        {Object.values(ApertureType).map(t => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
                    </select>
                    <div className="absolute right-3 top-3.5 pointer-events-none text-gray-500 group-hover:text-science-500 transition-colors">
                        <ChevronDown />
                    </div>
                </div>
            </div>

            {!isFractalMode && aperture.type !== ApertureType.SLIT_ARRAY && (
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <label className="text-gray-300 text-[10px] uppercase font-bold tracking-wide">
                            {aperture.type === ApertureType.MULTI_DOT || aperture.type === ApertureType.FIBONACCI || aperture.type === ApertureType.RANDOM 
                                ? 'DOT SIZE (mm)' 
                                : aperture.type === ApertureType.SLIT || aperture.type === ApertureType.CROSS 
                                    ? 'LENGTH (mm)'
                                    : aperture.type === ApertureType.WAVES || aperture.type === ApertureType.YIN_YANG 
                                        ? 'TOTAL WIDTH (mm)'
                                        : aperture.type === ApertureType.LITHO_OPC 
                                            ? 'MAIN FEATURE SIZE (mm)'
                                            : aperture.type === ApertureType.CUSTOM
                                                ? 'PHYSICAL SIZE (mm)'
                                                : aperture.type === ApertureType.URA
                                                    ? 'TOTAL SIZE (mm)'
                                                    : 'DIAMETER (mm)'}
                        </label>
                        <input 
                            type="number" 
                            step="0.01" 
                            min="0.001"
                            value={aperture.diameter} 
                            onChange={(e) => updateAp('diameter', parseFloat(e.target.value))}
                            className="bg-[#222] border border-[#444] text-science-400 w-20 px-2 py-1 text-xs rounded text-right font-mono focus:border-science-500 outline-none"
                        />
                    </div>
                    
                    <input 
                        type="range" 
                        min="0.05" 
                        max={Math.max(10.0, diagSensor * 1.1)} 
                        step="0.01" 
                        value={aperture.diameter} 
                        onChange={e => updateAp('diameter', parseFloat(e.target.value))} 
                        className="w-full accent-science-500 h-1.5 bg-gray-800 rounded appearance-none cursor-pointer" 
                    />
                    
                    {(aperture.type === ApertureType.PINHOLE || aperture.type === ApertureType.ZONE_PLATE || aperture.type === ApertureType.PHOTON_SIEVE) && (
                        <button 
                            onClick={() => updateAp('diameter', parseFloat(simResult.optimalDiameter.toFixed(3)))}
                            className="w-full mt-1 bg-science-950/40 text-science-400 border border-science-900/50 py-1.5 text-[10px] rounded hover:bg-science-900/60 transition-colors uppercase font-medium tracking-wide"
                        >
                            Set Optimal: {simResult.optimalDiameter.toFixed(3)}mm
                        </button>
                    )}

                    {isExtendedShape && (
                        <button 
                            onClick={() => updateAp('diameter', parseFloat(diagSensor.toFixed(2)))}
                            className="w-full mt-1 bg-emerald-900/20 text-emerald-400 border border-emerald-900/30 py-1.5 text-[10px] rounded hover:bg-emerald-900/40 transition-colors uppercase font-medium tracking-wide"
                        >
                            Fit to Sensor: {diagSensor.toFixed(1)}mm
                        </button>
                    )}
                </div>
            )}
                
            {renderApertureSpecifics()}
            
            <div className="space-y-1 pt-2 border-t border-[#2a2a2a]">
                <div className="flex justify-between">
                    <label className="text-gray-400 text-[10px] uppercase font-bold">Plate Rotation</label>
                    <span className="text-science-400 font-mono text-xs">{aperture.rotation || 0}°</span>
                </div>
                <input type="range" min="0" max="360" step="1" value={aperture.rotation || 0} onChange={e => updateAp('rotation', parseInt(e.target.value))} className="w-full accent-science-500 h-1.5 bg-gray-800 rounded appearance-none cursor-pointer" />
            </div>
          </div>
        </section>

        {/* --- FILM & SIMULATION SETTINGS --- */}
        <section>
          <div className="flex items-center gap-2 mb-3 mt-4 pt-4 border-t border-[#1a1a1a]">
             <div className="text-science-500"><FilmIcon /></div>
             <h2 className="text-gray-200 font-medium text-xs uppercase tracking-wider">Film & Simulation</h2>
          </div>

          <div className="space-y-4">
             {/* DIFFRACTION TOGGLE */}
            <div className="bg-[#111] p-2 rounded border border-[#222]">
                 <label className="flex items-center gap-3 cursor-pointer">
                    <div className="relative">
                        <input 
                            type="checkbox" 
                            checked={aperture.renderDiffraction || false} 
                            onChange={e => updateAp('renderDiffraction', e.target.checked)} 
                            className="sr-only peer"
                        />
                        <div className="w-9 h-5 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-science-500"></div>
                    </div>
                    <div>
                         <span className="text-xs font-bold text-gray-200 block flex items-center gap-2">
                             Render Diffraction (FFT) <span className="text-[9px] px-1 py-0.5 bg-science-900 text-science-300 rounded border border-science-700">GPU</span>
                         </span>
                         <span className="text-[9px] text-gray-500 block">Simulate physical wave interference.</span>
                    </div>
                </label>
            </div>

            {/* ISO */}
            <div className="space-y-1">
                <div className="flex justify-between items-baseline">
                    <label className="text-gray-500 text-[10px] uppercase font-bold">ISO Sensitivity</label>
                    <span className="text-science-500 font-mono text-xs">{camera.iso}</span>
                </div>
                <input type="range" min="100" max="25600" step="100" value={camera.iso} onChange={e => updateCam('iso', parseInt(e.target.value))} className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" />
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2">
                <label className="flex items-center gap-2 text-gray-400 cursor-pointer p-2 bg-[#111] rounded border border-[#222] hover:bg-[#161616]">
                    <input type="checkbox" checked={aperture.usePolychromatic} onChange={e => updateAp('usePolychromatic', e.target.checked)} className="accent-science-500" />
                    <span className="text-[10px] font-bold">POLYCHROMATIC</span>
                </label>
                <label className="flex items-center gap-2 text-gray-400 cursor-pointer p-2 bg-[#111] rounded border border-[#222] hover:bg-[#161616]">
                    <input type="checkbox" checked={aperture.useVignetting} onChange={e => updateAp('useVignetting', e.target.checked)} className="accent-science-500" />
                    <span className="text-[10px] font-bold">VIGNETTING</span>
                </label>
            </div>
          </div>
        </section>

        {/* --- SIMULATE BUTTON --- */}
        <button 
            onClick={isProcessing ? onCancel : onSimulate}
            className={`w-full py-3 rounded font-bold text-white text-sm transition-all active:scale-[0.98] shadow-lg ${
                isProcessing 
                ? 'bg-red-900/80 hover:bg-red-800 text-red-100 shadow-red-900/20' 
                : 'bg-science-600 hover:bg-science-500 shadow-science-900/20'
            }`}
        >
            {isProcessing ? 'STOP RENDERING' : 'RENDER SIMULATION'}
        </button>

        {/* --- METRICS --- */}
        <section className="bg-[#111] p-3 rounded border border-[#1a1a1a] mt-4">
          <h2 className="text-gray-500 text-[10px] uppercase font-bold border-b border-[#222] pb-1 mb-2">Calculated Physics</h2>
          <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                  <p className="text-gray-500 text-[9px]">EFFECTIVE F-STOP</p>
                  <p className="text-white font-mono">f/{simResult.fNumber.toFixed(1)}</p>
                  <p className="text-[8px] text-gray-600">Based on Total Open Area</p>
              </div>
              <div>
                  <p className="text-gray-500 text-[9px]">35MM EQUIV.</p>
                  <p className="text-white font-mono">{simResult.focalLength35mm.toFixed(1)}mm</p>
              </div>
               <div>
                  <p className="text-gray-500 text-[9px]">FOV (H x V)</p>
                  <p className="text-white font-mono">{simResult.fovH.toFixed(0)}° x {simResult.fovV.toFixed(0)}°</p>
              </div>
              <div>
                  <p className="text-gray-500 text-[9px]">LIMITER</p>
                  <p className={`font-mono ${simResult.isDiffractionLimited ? 'text-amber-500' : 'text-cyan-500'}`}>
                    {simResult.isDiffractionLimited ? 'DIFFRACTION' : 'GEOMETRY'}
                  </p>
                  <p className="text-[8px] text-gray-600">Based on Smallest Feature</p>
              </div>
          </div>
        </section>

        {/* --- EXPOSURE ASSISTANT --- */}
        <div className="bg-[#111] border border-[#222] rounded-lg overflow-hidden mt-4">
             <button 
                onClick={() => setIsExpCalcOpen(!isExpCalcOpen)}
                className="w-full p-3 flex justify-between items-center hover:bg-[#161616] transition-colors"
             >
                <div className="flex items-center gap-3">
                    <div className="text-amber-500"><TimerIcon /></div>
                    <div className="text-left">
                        <div className="text-gray-200 font-medium text-xs uppercase tracking-wider">Exposure Assistant</div>
                        <div className="text-gray-500 text-[10px]">Calculator & Reciprocity</div>
                    </div>
                </div>
                <div className="text-gray-500">{isExpCalcOpen ? <ChevronUp /> : <ChevronDown />}</div>
             </button>

             {isExpCalcOpen && (
                 <div className="p-3 border-t border-[#222] space-y-3 bg-[#0e0e0e]">
                    <p className="text-[10px] text-gray-500 mb-2">Input reading from external light meter:</p>
                    
                    <div className="grid grid-cols-3 gap-2">
                         <div>
                            <label className="text-gray-500 text-[9px] uppercase font-bold block mb-1">Meter Aperture</label>
                            <div className="flex items-center bg-[#1a1a1a] border border-[#333] rounded">
                                <span className="pl-2 text-[10px] text-gray-500">f/</span>
                                <input 
                                    type="number" step="0.1" value={meterF} 
                                    onChange={(e) => setMeterF(parseFloat(e.target.value))}
                                    className="w-full bg-transparent p-1.5 text-gray-200 text-xs outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-gray-500 text-[9px] uppercase font-bold block mb-1">Meter Shutter</label>
                             <div className="flex items-center bg-[#1a1a1a] border border-[#333] rounded">
                                <span className="pl-2 text-[10px] text-gray-500">1/</span>
                                <input 
                                    type="number" step="1" value={meterT} 
                                    onChange={(e) => setMeterT(parseFloat(e.target.value))}
                                    className="w-full bg-transparent p-1.5 text-gray-200 text-xs outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="text-gray-500 text-[9px] uppercase font-bold block mb-1">Meter ISO</label>
                            <input 
                                type="number" step="10" value={meterIso} 
                                onChange={(e) => setMeterIso(parseFloat(e.target.value))}
                                className="w-full bg-[#1a1a1a] border border-[#333] p-1.5 rounded text-gray-200 text-xs outline-none"
                            />
                        </div>
                    </div>

                    <div className="bg-[#1a1a1a] p-2 rounded border border-[#333] mt-2">
                        <div className="flex justify-between items-center">
                            <span className="text-gray-400 text-[10px] uppercase">Calculated Exposure</span>
                            <span className="text-amber-500 font-mono font-bold text-sm">{calculatedTime}</span>
                        </div>
                        <p className="text-[8px] text-gray-500 mt-1 italic">Uses effective area integration for accurate time.</p>
                    </div>
                 </div>
             )}
        </div>

        {/* --- CAMERA BODY SECTION --- */}
        <div className="bg-[#111] border border-[#222] rounded-lg overflow-hidden mt-4">
             <button 
                onClick={() => setIsCameraOpen(!isCameraOpen)}
                className="w-full p-3 flex justify-between items-center hover:bg-[#161616] transition-colors"
             >
                <div className="flex items-center gap-3">
                    <div className="text-gray-500"><CameraIcon /></div>
                    <div className="text-left">
                        <div className="text-gray-200 font-medium text-xs uppercase tracking-wider">Camera Body</div>
                        <div className="text-science-500 font-mono text-xs truncate max-w-[160px]">{currentPresetName}</div>
                    </div>
                </div>
                <div className="text-gray-500">{isCameraOpen ? <ChevronUp /> : <ChevronDown />}</div>
             </button>

             {isCameraOpen && (
                 <div className="p-3 border-t border-[#222] space-y-4 bg-[#0e0e0e]">
                    
                    {/* Model Select */}
                    <div>
                        <label className="text-gray-500 text-[10px] uppercase font-bold block mb-1">Preset Model</label>
                        <select 
                            className="w-full bg-[#1a1a1a] border border-[#333] p-2 rounded text-gray-200 text-xs outline-none focus:border-science-500"
                            value={camera.modelName || 'custom'}
                            onChange={(e) => handlePresetChange(e.target.value)}
                        >
                            <optgroup label="Digital">
                                {CAMERA_PRESETS.filter(p => p.type === 'Digital').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </optgroup>
                            <optgroup label="Film / Analog">
                                {CAMERA_PRESETS.filter(p => p.type === 'Film').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </optgroup>
                            <option value="custom">Custom / Homemade</option>
                        </select>
                    </div>

                    {/* Sensor Dimensions */}
                    <div className="grid grid-cols-2 gap-2">
                        <div>
                            <label className="text-gray-500 text-[10px] uppercase font-bold block mb-1">Sensor Width</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    disabled={!isCustomCamera}
                                    value={camera.sensorWidth}
                                    onChange={e => updateCam('sensorWidth', parseFloat(e.target.value))}
                                    className={`w-full bg-[#1a1a1a] border border-[#333] p-2 rounded text-gray-200 text-xs focus:border-science-500 ${!isCustomCamera && 'opacity-50 cursor-not-allowed'}`}
                                />
                                <span className="absolute right-2 top-2 text-gray-600 text-xs">mm</span>
                            </div>
                        </div>
                        <div>
                            <label className="text-gray-500 text-[10px] uppercase font-bold block mb-1">Sensor Height</label>
                            <div className="relative">
                                <input 
                                    type="number" 
                                    disabled={!isCustomCamera}
                                    value={camera.sensorHeight}
                                    onChange={e => updateCam('sensorHeight', parseFloat(e.target.value))}
                                    className={`w-full bg-[#1a1a1a] border border-[#333] p-2 rounded text-gray-200 text-xs focus:border-science-500 ${!isCustomCamera && 'opacity-50 cursor-not-allowed'}`}
                                />
                                <span className="absolute right-2 top-2 text-gray-600 text-xs">mm</span>
                            </div>
                        </div>
                    </div>

                    {/* Flange / Focal Length */}
                    <div className="space-y-1">
                        <div className="flex justify-between items-baseline">
                            <label className="text-gray-500 text-[10px] uppercase font-bold">Focal Length (Box Depth)</label>
                            <span className="text-science-500 font-mono text-xs">{camera.focalLength.toFixed(1)} mm</span>
                        </div>
                        <input 
                            type="range" 
                            min={Math.max(1, flangeDist)} 
                            max="300" 
                            step="1" 
                            value={camera.focalLength} 
                            onChange={e => updateCam('focalLength', parseFloat(e.target.value))} 
                            className="w-full accent-science-500 h-1 bg-gray-700 rounded appearance-none" 
                        />
                        <div className="flex justify-between text-[9px] text-gray-600 font-mono">
                            <span>Flange: {flangeDist}mm</span>
                            <span className={extension === 0 ? 'text-red-500' : 'text-gray-400'}>
                                Extension: {extension.toFixed(1)}mm
                            </span>
                        </div>
                    </div>

                    {/* INTEGRATED CUSTOM DESIGNER */}
                    {isCustomCamera && (
                        <div className="mt-4 p-3 bg-gray-900/50 rounded border border-gray-800 space-y-3">
                            <div className="flex items-center gap-2 mb-2 border-b border-gray-800 pb-2">
                                <div className="text-cyan-500"><DesignIcon /></div>
                                <h3 className="text-cyan-500 text-[10px] uppercase font-bold tracking-wider">Design & Build Assistant</h3>
                            </div>
                            
                            {/* 2. Target Equivalent */}
                            <div>
                                <label className="text-gray-500 text-[9px] uppercase font-bold block mb-1">Target 35mm Equivalent Focal Length</label>
                                <div className="flex gap-2">
                                    <div className="relative flex-1">
                                        <input 
                                            type="number" 
                                            value={targetEquiv} 
                                            onChange={(e) => setTargetEquiv(parseFloat(e.target.value))} 
                                            className="w-full bg-[#1a1a1a] border border-[#333] p-1.5 rounded text-gray-200 text-xs focus:border-cyan-500 outline-none"
                                        />
                                        <span className="absolute right-2 top-1.5 text-gray-600 text-[10px]">mm</span>
                                    </div>
                                    <button 
                                        onClick={() => updateCam('focalLength', targetEquiv / cropFactor)}
                                        className="bg-cyan-900/30 text-cyan-500 border border-cyan-800 px-3 rounded text-[10px] hover:bg-cyan-900/50 uppercase font-bold"
                                    >
                                        Set Box Depth
                                    </button>
                                </div>
                                <div className="text-[9px] text-gray-500 mt-1 font-mono">
                                    Requires Physical Depth: <span className="text-gray-300">{(targetEquiv / cropFactor).toFixed(1)}mm</span> 
                                    <span className="ml-2 opacity-50">(Crop: {cropFactor.toFixed(2)}x)</span>
                                </div>
                            </div>

                            {/* 3. Optimal Aperture for this box */}
                            <div>
                                <label className="text-gray-500 text-[9px] uppercase font-bold block mb-1">Optimal Pinhole Diameter</label>
                                <div className="flex justify-between items-center bg-black/40 p-2 rounded border border-gray-800">
                                    <div className="flex flex-col">
                                        <span className="font-mono text-cyan-400 text-sm font-bold">{simResult.optimalDiameter.toFixed(3)} mm</span>
                                        <span className="text-[8px] text-gray-600">Rayleigh Criterion for current depth</span>
                                    </div>
                                    <button 
                                        onClick={() => updateAp('diameter', parseFloat(simResult.optimalDiameter.toFixed(3)))}
                                        className="bg-[#222] text-gray-300 border border-[#444] px-3 py-1 rounded text-[10px] hover:bg-[#333] uppercase"
                                    >
                                        Apply to Aperture
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                 </div>
             )}
        </div>
        
      </div>
    </div>
  );
};

export default ControlPanel;
