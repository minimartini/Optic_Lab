
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
const ChevronDown = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>;
const ChevronUp = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" /></svg>;
const CameraIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const ApertureIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>; 
const FilmIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" /></svg>;
const TimerIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
const DesignIcon = () => <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>;
const UploadIcon = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" /></svg>;
const ClipboardIcon = () => <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>;

// --- CURVE PRESETS ---
const CURVE_PRESETS: (Partial<ApertureConfig> & { name: string })[] = [
    {
        name: "Lissajous: Figure 8",
        type: ApertureType.LISSAJOUS,
        lissajousRX: 1, lissajousRY: 2, lissajousDelta: 90
    },
    {
        name: "Lissajous: Knot (3:2)",
        type: ApertureType.LISSAJOUS,
        lissajousRX: 3, lissajousRY: 2, lissajousDelta: 90
    },
    {
        name: "Lissajous: Complex (5:4)",
        type: ApertureType.LISSAJOUS,
        lissajousRX: 5, lissajousRY: 4, lissajousDelta: 0
    },
    {
        name: "Spiral: Galaxy (Multi-Arm)",
        type: ApertureType.SPIRAL,
        spiralArms: 3, spiralTurns: 2
    },
    {
        name: "Spiral: Tight Coil",
        type: ApertureType.SPIRAL,
        spiralArms: 1, spiralTurns: 10
    },
    {
        name: "Ripple: Flower (5 Petal)",
        type: ApertureType.ROSETTE,
        rosettePetals: 5, slitHeight: 2.0 // Amplitude
    },
    {
        name: "Ripple: Starburst (12 Petal)",
        type: ApertureType.ROSETTE,
        rosettePetals: 12, slitHeight: 1.0
    }
];

// --- UI COMPONENTS ---
const PanelModule: React.FC<{ 
    title: string; 
    icon?: React.ReactNode; 
    children: React.ReactNode; 
    isOpen?: boolean;
    onToggle?: () => void;
    className?: string;
}> = ({ title, icon, children, isOpen, onToggle, className = "" }) => (
    <div className={`border border-white/10 rounded-xl bg-white/5 backdrop-blur-sm overflow-hidden mb-4 transition-all duration-300 ${className}`}>
        {onToggle ? (
            <button onClick={onToggle} className="w-full flex items-center justify-between p-3 bg-white/5 hover:bg-white/10 transition-colors">
                <div className="flex items-center gap-2 text-science-400">
                    {icon}
                    <span className="text-xs font-bold tracking-widest uppercase text-gray-300">{title}</span>
                </div>
                <div className="text-gray-500">{isOpen ? <ChevronUp /> : <ChevronDown />}</div>
            </button>
        ) : (
            <div className="flex items-center gap-2 p-3 border-b border-white/5 bg-white/5">
                <div className="text-science-400">{icon}</div>
                <span className="text-xs font-bold tracking-widest uppercase text-gray-300">{title}</span>
            </div>
        )}
        {(isOpen === undefined || isOpen) && <div className="p-4 space-y-4">{children}</div>}
    </div>
);

const RangeControl: React.FC<{
    label: string;
    value: number;
    min: number;
    max: number;
    step: number;
    onChange: (val: number) => void;
    unit?: string;
}> = ({ label, value, min, max, step, onChange, unit }) => (
    <div className="space-y-1.5">
        <div className="flex justify-between items-center">
            <label className="text-[10px] uppercase font-semibold text-gray-500 tracking-wide">{label}</label>
            <span className="font-mono text-xs text-science-400 bg-science-950/50 px-1.5 py-0.5 rounded border border-science-900/30">
                {value.toFixed(step < 0.1 ? 3 : step < 1 ? 1 : 0)}{unit}
            </span>
        </div>
        <input 
            type="range" min={min} max={max} step={step} value={value} 
            onChange={e => onChange(parseFloat(e.target.value))} 
            className="w-full accent-science-500 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer hover:bg-gray-600 transition-colors" 
        />
    </div>
);

const SelectControl: React.FC<React.SelectHTMLAttributes<HTMLSelectElement>> = (props) => (
    <div className="relative group">
        <select 
            {...props}
            className={`w-full appearance-none bg-black/40 border border-white/10 text-gray-200 text-xs rounded p-2 outline-none focus:border-science-500/50 focus:ring-1 focus:ring-science-500/20 transition-all ${props.className}`}
        />
        <div className="absolute right-2 top-2.5 pointer-events-none text-gray-500 group-hover:text-science-400">
            <ChevronDown />
        </div>
    </div>
);


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

  const handleCurvePreset = (idxStr: string) => {
      const idx = parseInt(idxStr);
      if (idx >= 0 && idx < CURVE_PRESETS.length) {
          const p = CURVE_PRESETS[idx];
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          const { name, ...config } = p;
          setAperture(prev => ({ ...prev, ...config }));
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
      if (!navigator.clipboard || !navigator.clipboard.read) {
          throw new Error("Clipboard API not supported");
      }
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
    } catch (err: any) {
      console.error(err);
      if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
          alert("Clipboard access blocked. Use Import.");
      } else {
          alert("Clipboard error. Use Import.");
      }
    }
  };

  // Logic to calculate optimized double slit parameters
  const optimizeDoubleSlit = () => {
      const optimalWidth = simResult.optimalDiameter;
      const lambdaMm = (camera.wavelength || 550) * 1e-6;
      const f = camera.focalLength;
      const targetFringeSpacing = 0.3; // mm
      const optimalSeparation = (lambdaMm * f) / targetFringeSpacing;

      setAperture(prev => ({
          ...prev,
          slitWidth: parseFloat(optimalWidth.toFixed(4)),
          spread: parseFloat(optimalSeparation.toFixed(3)),
          diameter: Math.max(5.0, camera.sensorHeight * 1.1), 
          count: 2
      }));
  };

  const isCustomCamera = camera.modelName === 'custom';
  const isFractalMode = aperture.type === ApertureType.FRACTAL || aperture.type === ApertureType.SIERPINSKI_TRIANGLE;
  const isExtendedShape = [
      ApertureType.SLIT, ApertureType.CROSS, ApertureType.WAVES, 
      ApertureType.YIN_YANG, ApertureType.LITHO_OPC, ApertureType.FREEFORM, 
      ApertureType.CUSTOM, ApertureType.URA, ApertureType.SLIT_ARRAY,
      ApertureType.LISSAJOUS, ApertureType.SPIRAL, ApertureType.ROSETTE
  ].includes(aperture.type);
  
  const isDotSize = [ApertureType.MULTI_DOT, ApertureType.RANDOM, ApertureType.FIBONACCI].includes(aperture.type);
  const isMathCurve = [ApertureType.LISSAJOUS, ApertureType.SPIRAL, ApertureType.ROSETTE].includes(aperture.type);

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
          <div className="space-y-4 pt-2 border-t border-white/5">
            <RangeControl 
                label="Number of Zones"
                value={aperture.zones || 10} min={1} max={50} step={1}
                onChange={v => updateAp('zones', v)}
            />
            
            {aperture.type === ApertureType.ZONE_PLATE && (
                <div className="pt-2">
                    <label className="text-gray-500 text-[9px] uppercase font-bold block mb-2 tracking-wide">Transmission Profile</label>
                    <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                        {['BINARY', 'SINUSOIDAL', 'SPIRAL'].map(mode => (
                            <button 
                                key={mode}
                                onClick={() => updateAp('zonePlateProfile', mode)}
                                className={`flex-1 py-1.5 text-[9px] rounded font-bold transition-all ${
                                    (aperture.zonePlateProfile === mode || (!aperture.zonePlateProfile && mode === 'BINARY'))
                                    ? 'bg-science-600 text-white shadow-lg' 
                                    : 'text-gray-500 hover:text-gray-300'
                                }`}
                            >
                                {mode.substring(0,4)}
                            </button>
                        ))}
                    </div>
                </div>
            )}
          </div>
        );
      case ApertureType.SLIT:
      case ApertureType.CROSS:
        return (
          <div className="pt-2 border-t border-white/5">
            <RangeControl label="Line Thickness" value={aperture.slitWidth || 0.2} min={0.01} max={2.0} step={0.01} onChange={v => updateAp('slitWidth', v)} unit="mm" />
             <button 
                onClick={() => updateAp('slitWidth', parseFloat(simResult.optimalDiameter.toFixed(3)))}
                className="w-full mt-2 bg-science-950/40 text-science-400 border border-science-900/50 py-1.5 text-[10px] rounded hover:bg-science-900/60 transition-colors uppercase font-medium tracking-wide"
            >
                Set Optimal: {simResult.optimalDiameter.toFixed(3)}mm
            </button>
          </div>
        );
      case ApertureType.SLIT_ARRAY:
          return (
             <div className="space-y-4 pt-2 border-t border-white/5">
                 <div className="flex justify-between items-center bg-cyan-950/20 p-2 rounded border border-cyan-900/30">
                    <span className="text-[9px] text-cyan-400 font-bold uppercase tracking-wide">Young's Setup</span>
                    <button 
                        onClick={optimizeDoubleSlit}
                        className="text-[9px] bg-cyan-500/20 text-cyan-300 px-2 py-1 rounded hover:bg-cyan-500/30 border border-cyan-500/30 transition-colors"
                    >
                        Auto-Optimize
                    </button>
                 </div>
                 
                 <RangeControl label="Slit Count" value={aperture.count || 2} min={2} max={20} step={1} onChange={v => updateAp('count', v)} />
                 
                 <div className="space-y-2">
                    <RangeControl label="Slit Width" value={aperture.slitWidth || 0.1} min={0.01} max={1.0} step={0.005} onChange={v => updateAp('slitWidth', v)} unit="mm" />
                    <button 
                        onClick={() => updateAp('slitWidth', parseFloat(simResult.optimalDiameter.toFixed(3)))}
                        className="w-full bg-white/5 text-science-400 border border-white/10 py-1 text-[9px] rounded hover:bg-white/10 transition-colors uppercase"
                    >
                        Optimal Width: {simResult.optimalDiameter.toFixed(3)}mm
                    </button>
                 </div>

                 <RangeControl label="Separation" value={aperture.spread || 0.5} min={0.05} max={5.0} step={0.05} onChange={v => updateAp('spread', v)} unit="mm" />
                
                {simResult.fringeSpacing && (
                    <div className="p-3 bg-black/40 rounded border border-white/5 space-y-1">
                        <div className="flex justify-between text-[10px]">
                            <span className="text-gray-500">Fringe Spacing</span>
                            <span className="text-white font-mono">{simResult.fringeSpacing.toFixed(3)} mm</span>
                        </div>
                        <div className="flex justify-between text-[10px]">
                            <span className="text-gray-500">Visibility</span>
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
             <div className="space-y-4 pt-2 border-t border-white/5">
                <div>
                    <div className="flex justify-between mb-1">
                        <label className="text-[10px] uppercase font-semibold text-gray-500">URA Rank (Prime)</label>
                        <span className="font-mono text-xs text-science-400">{aperture.uraRank || 13}</span>
                    </div>
                    <input 
                        type="range" min="0" max="5" step="1" 
                        value={[5, 7, 11, 13, 17, 19].indexOf(aperture.uraRank || 13)}
                        onChange={e => {
                            const ranks = [5, 7, 11, 13, 17, 19];
                            updateAp('uraRank', ranks[parseInt(e.target.value)]);
                        }}
                        className="w-full accent-science-500 h-1 bg-gray-700 rounded-full appearance-none cursor-pointer" 
                    />
                    <div className="flex justify-between text-[8px] text-gray-600 mt-1 font-mono">
                        <span>5</span><span>7</span><span>11</span><span>13</span><span>17</span><span>19</span>
                    </div>
                </div>
                <p className="text-[9px] text-gray-500 italic bg-white/5 p-2 rounded">
                     Uniformly Redundant Arrays allow high light throughput with recoverable detail.
                 </p>
             </div>
         );

      case ApertureType.LISSAJOUS:
        return (
             <div className="space-y-4 pt-2 border-t border-white/5">
                 <div className="grid grid-cols-2 gap-3">
                     <div className="space-y-1">
                        <label className="text-gray-500 text-[10px] uppercase font-bold">Freq X</label>
                        <input type="number" min="1" max="20" value={aperture.lissajousRX || 3} onChange={e => updateAp('lissajousRX', parseInt(e.target.value))} className="w-full bg-black/40 border border-white/10 p-1.5 rounded text-xs text-white outline-none focus:border-science-500" />
                     </div>
                     <div className="space-y-1">
                        <label className="text-gray-500 text-[10px] uppercase font-bold">Freq Y</label>
                        <input type="number" min="1" max="20" value={aperture.lissajousRY || 2} onChange={e => updateAp('lissajousRY', parseInt(e.target.value))} className="w-full bg-black/40 border border-white/10 p-1.5 rounded text-xs text-white outline-none focus:border-science-500" />
                     </div>
                 </div>
                 <RangeControl label="Phase Shift" value={aperture.lissajousDelta || 0} min={0} max={360} step={1} onChange={v => updateAp('lissajousDelta', v)} unit="°" />
                 <RangeControl label="Line Thickness" value={aperture.slitWidth || 0.1} min={0.01} max={1.0} step={0.01} onChange={v => updateAp('slitWidth', v)} unit="mm" />
             </div>
        );

      case ApertureType.SPIRAL:
        return (
             <div className="space-y-4 pt-2 border-t border-white/5">
                 <RangeControl label="Turns" value={aperture.spiralTurns || 3} min={1} max={20} step={0.5} onChange={v => updateAp('spiralTurns', v)} />
                 <RangeControl label="Arms" value={aperture.spiralArms || 1} min={1} max={12} step={1} onChange={v => updateAp('spiralArms', v)} />
                 <RangeControl label="Line Thickness" value={aperture.slitWidth || 0.1} min={0.01} max={1.0} step={0.01} onChange={v => updateAp('slitWidth', v)} unit="mm" />
             </div>
        );

      case ApertureType.ROSETTE:
        return (
             <div className="space-y-4 pt-2 border-t border-white/5">
                 <RangeControl label="Petals / Ripples" value={aperture.rosettePetals || 5} min={3} max={50} step={1} onChange={v => updateAp('rosettePetals', v)} />
                 <RangeControl label="Amplitude" value={aperture.slitHeight || 1.0} min={0.1} max={10.0} step={0.1} onChange={v => updateAp('slitHeight', v)} unit="mm" />
                 <RangeControl label="Line Thickness" value={aperture.slitWidth || 0.1} min={0.01} max={1.0} step={0.01} onChange={v => updateAp('slitWidth', v)} unit="mm" />
             </div>
        );

      case ApertureType.WAVES: 
      case ApertureType.YIN_YANG:
         return (
             <div className="space-y-4 pt-2 border-t border-white/5">
                <RangeControl label="Line Thickness" value={aperture.slitWidth || 0.1} min={0.01} max={1.0} step={0.01} onChange={v => updateAp('slitWidth', v)} unit="mm" />
                <button onClick={() => updateAp('slitWidth', parseFloat(simResult.optimalDiameter.toFixed(3)))} className="w-full bg-white/5 text-science-400 border border-white/10 py-1 text-[9px] rounded hover:bg-white/10 transition-colors uppercase">Set Optimal Width</button>
                <RangeControl label="Wave Amplitude" value={aperture.slitHeight || 2.0} min={0.5} max={Math.max(10.0, diagSensor * 1.1)} step={0.1} onChange={v => updateAp('slitHeight', v)} unit="mm" />
                <RangeControl label="Wave Count" value={aperture.count || 2} min={1} max={10} step={1} onChange={v => updateAp('count', v)} />
                
                {aperture.type === ApertureType.YIN_YANG && (
                     <div className="pt-2 border-t border-white/5">
                        <RangeControl label="Dot Size" value={aperture.innerDiameter || 0.2} min={0.01} max={2.0} step={0.01} onChange={v => updateAp('innerDiameter', v)} unit="mm" />
                    </div>
                )}
             </div>
         );

      case ApertureType.LITHO_OPC:
        return (
             <div className="space-y-4 pt-2 border-t border-white/5">
                 <div className="p-2 bg-indigo-950/20 border border-indigo-900/30 rounded">
                    <h3 className="text-[9px] text-indigo-400 font-bold uppercase mb-1">Resolution Enhancement</h3>
                    <p className="text-[9px] text-gray-500">Simulates sub-resolution assist features (SRAF) used in photolithography.</p>
                 </div>
                 <RangeControl label="Main Feature" value={aperture.diameter} min={0.05} max={5.0} step={0.05} onChange={v => updateAp('diameter', v)} unit="mm" />
                 <RangeControl label="SRAF Size" value={aperture.slitWidth || 0.05} min={0.01} max={1.0} step={0.01} onChange={v => updateAp('slitWidth', v)} unit="mm" />
                 <RangeControl label="SRAF Distance" value={aperture.spread || 1.0} min={0.1} max={5.0} step={0.1} onChange={v => updateAp('spread', v)} unit="mm" />
             </div>
        );

      case ApertureType.ANNULAR:
      case ApertureType.STAR:
         return (
            <div className="space-y-4 pt-2 border-t border-white/5">
                <RangeControl label="Inner Diameter" value={aperture.innerDiameter || aperture.diameter * 0.5} min={0.01} max={aperture.diameter} step={0.01} onChange={v => updateAp('innerDiameter', v)} unit="mm" />
                {aperture.type === ApertureType.STAR && (
                    <RangeControl label="Points" value={aperture.spikes || 5} min={3} max={20} step={1} onChange={v => updateAp('spikes', v)} />
                )}
            </div>
         );

      case ApertureType.MULTI_DOT:
      case ApertureType.FIBONACCI:
      case ApertureType.RANDOM:
        return (
          <div className="space-y-4 pt-2 border-t border-white/5">
            {aperture.type === ApertureType.MULTI_DOT && (
                <div>
                    <label className="text-gray-500 text-[10px] uppercase font-bold block mb-1">Pattern Type</label>
                    <SelectControl value={aperture.multiDotPattern} onChange={(e) => updateAp('multiDotPattern', e.target.value)}>
                        {Object.values(MultiDotPattern).map(p => <option key={p} value={p}>{p}</option>)}
                    </SelectControl>
                </div>
            )}
            
            <RangeControl label="Count" value={aperture.count || 10} min={1} max={500} step={1} onChange={v => updateAp('count', v)} />
            <RangeControl label="Spread" value={aperture.spread || 2.0} min={0.5} max={20.0} step={0.1} onChange={v => updateAp('spread', v)} unit="mm" />

             <div className="flex items-center justify-between bg-white/5 p-2 rounded">
                <label className="text-gray-500 text-[10px] uppercase font-bold">Random Seed</label>
                <button 
                    onClick={() => updateAp('seed', Math.floor(Math.random() * 10000))}
                    className="text-[9px] bg-science-900/30 text-science-300 border border-science-700/50 px-2 py-1 rounded hover:bg-science-900/50"
                >
                    Regenerate
                </button>
            </div>
          </div>
        );

      case ApertureType.FRACTAL:
      case ApertureType.SIERPINSKI_TRIANGLE:
         return (
             <div className="space-y-4 pt-2 border-t border-white/5">
                 <RangeControl label="Iterations" value={aperture.iteration || 3} min={1} max={6} step={1} onChange={v => updateAp('iteration', v)} />
                 <RangeControl label="Size" value={aperture.spread || 5.0} min={1.0} max={20.0} step={0.5} onChange={v => updateAp('spread', v)} unit="mm" />
             </div>
         );
         
      case ApertureType.FREEFORM:
         return (
             <div className="space-y-4 pt-2 border-t border-white/5">
                 <RangeControl label="Brush Size" value={aperture.brushSize || 0.5} min={0.1} max={5.0} step={0.1} onChange={v => updateAp('brushSize', v)} unit="mm" />
                 <RangeControl label="Canvas Size" value={aperture.diameter} min={5} max={100} step={1} onChange={v => updateAp('diameter', v)} unit="mm" />
                 
                 <div className="flex gap-2 pt-1">
                     <button onClick={() => updateAp('customPath', [])} className="flex-1 bg-red-500/10 text-red-400 py-1.5 text-[10px] rounded border border-red-500/20 hover:bg-red-500/20 transition-colors uppercase font-bold">Clear</button>
                     <button 
                         onClick={() => {
                             const pts = []; for(let i=0; i<10; i++) pts.push({x: (Math.random()-0.5), y: (Math.random()-0.5)});
                             updateAp('customPath', pts);
                         }}
                         className="flex-1 bg-white/5 text-gray-300 py-1.5 text-[10px] rounded border border-white/10 hover:bg-white/10 transition-colors uppercase font-bold"
                     >
                         Randomize
                     </button>
                 </div>
             </div>
         );

      case ApertureType.CUSTOM:
        return (
            <div className="space-y-4 pt-2 border-t border-white/5">
                <div>
                    <div className="flex justify-between items-center mb-2">
                        <label className="text-gray-500 text-[10px] uppercase font-bold">Mask Image</label>
                        <div className="flex gap-1">
                            <button onClick={handlePaste} className="bg-white/5 text-gray-300 px-2 py-1 rounded text-[10px] border border-white/10 hover:bg-white/10 flex items-center gap-1"><ClipboardIcon /></button>
                            <button onClick={() => fileInputRef.current?.click()} className="bg-science-900/30 text-science-300 px-2 py-1 rounded text-[10px] border border-science-700/50 hover:bg-science-900/50 flex items-center gap-1"><UploadIcon /> IMPORT</button>
                        </div>
                        <input type="file" ref={fileInputRef} onChange={handleMaskUpload} className="hidden" accept="image/*" />
                    </div>
                    {aperture.maskImage ? (
                        <div className="relative aspect-square w-16 bg-black border border-white/20 rounded-lg overflow-hidden mx-auto mb-2 shadow-lg">
                            <img src={aperture.maskImage} className="object-cover w-full h-full opacity-80" alt="Mask" />
                        </div>
                    ) : (
                        <div className="text-[10px] text-gray-600 text-center italic mb-2 py-4 border border-dashed border-white/10 rounded">No image loaded</div>
                    )}
                </div>

                <RangeControl label="Threshold" value={aperture.maskThreshold ?? 128} min={0} max={255} step={1} onChange={v => updateAp('maskThreshold', v)} />

                <label className="flex items-center gap-3 text-gray-400 cursor-pointer p-2 bg-white/5 rounded border border-white/10 hover:bg-white/10 transition-colors">
                    <div className="relative">
                        <input type="checkbox" checked={aperture.maskInvert || false} onChange={e => updateAp('maskInvert', e.target.checked)} className="sr-only peer" />
                        <div className="w-8 h-4 bg-gray-700 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-science-500"></div>
                    </div>
                    <span className="text-[10px] font-bold uppercase tracking-wide">Invert Mask</span>
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
    <div className="w-96 bg-noise bg-black border-r border-white/10 flex flex-col h-full overflow-y-auto font-sans text-sm backdrop-blur-sm shadow-2xl relative z-20">
      <div className="p-5 border-b border-white/10 bg-black/40 backdrop-blur-md sticky top-0 z-30">
        <h1 className="text-lg font-bold text-science-400 tracking-tighter flex items-center gap-2">
            <span className="text-xl">⦿</span> OPTIC_LAB <span className="text-gray-600 font-light text-xs tracking-widest ml-1">V2.0</span>
        </h1>
      </div>

      <div className="p-4 space-y-2">
        
        {/* --- APERTURE MODULE --- */}
        <PanelModule title="Aperture Module" icon={<ApertureIcon />} className="border-science-900/30 bg-science-950/5">
          <div className="mb-4 overflow-hidden rounded-lg border border-white/10 shadow-2xl shadow-black">
             <AperturePreview aperture={aperture} camera={camera} onUpdateAperture={(u) => setAperture(p => ({...p, ...u}))} />
          </div>

          <div className="space-y-4">
            <div>
                <label className="text-gray-500 text-[10px] uppercase font-bold block mb-1.5 tracking-wide">Pattern Type</label>
                <SelectControl value={aperture.type} onChange={(e) => updateAp('type', e.target.value as ApertureType)} className="font-mono">
                        <optgroup label="Standard"><option value={ApertureType.PINHOLE}>Pinhole</option><option value={ApertureType.SLIT}>Slit</option><option value={ApertureType.CROSS}>Cross</option><option value={ApertureType.ANNULAR}>Annular</option></optgroup>
                        <optgroup label="Diffractive"><option value={ApertureType.ZONE_PLATE}>Zone Plate</option><option value={ApertureType.PHOTON_SIEVE}>Photon Sieve</option><option value={ApertureType.URA}>URA (Coded)</option><option value={ApertureType.SLIT_ARRAY}>Double Slit</option><option value={ApertureType.LITHO_OPC}>Litho OPC</option></optgroup>
                        <optgroup label="Math Curves"><option value={ApertureType.LISSAJOUS}>Lissajous</option><option value={ApertureType.SPIRAL}>Spiral</option><option value={ApertureType.ROSETTE}>Rosette</option></optgroup>
                        <optgroup label="Patterns"><option value={ApertureType.MULTI_DOT}>Multi-Dot</option><option value={ApertureType.FIBONACCI}>Fibonacci</option><option value={ApertureType.RANDOM}>Random</option><option value={ApertureType.STAR}>Star</option><option value={ApertureType.FRACTAL}>Fractal</option><option value={ApertureType.SIERPINSKI_TRIANGLE}>Sierpinski</option></optgroup>
                        <optgroup label="Custom"><option value={ApertureType.WAVES}>Waves</option><option value={ApertureType.YIN_YANG}>Yin Yang</option><option value={ApertureType.FREEFORM}>Freeform</option><option value={ApertureType.CUSTOM}>Custom Mask</option></optgroup>
                </SelectControl>
            </div>

            {isMathCurve && (
                 <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded">
                    <label className="text-indigo-300 text-[10px] uppercase font-bold block mb-1">Preset Config</label>
                    <SelectControl onChange={(e) => handleCurvePreset(e.target.value)} defaultValue="-1">
                        <option value="-1" disabled>Select Curve...</option>
                        {CURVE_PRESETS.map((p, idx) => (<option key={idx} value={idx}>{p.name}</option>))}
                    </SelectControl>
                 </div>
            )}

            {!isFractalMode && (
                <div className="space-y-4">
                    <RangeControl 
                        label={isDotSize ? 'Dot Diameter' : isMathCurve ? 'Total Size' : 'Diameter / Width'}
                        value={aperture.diameter} min={0.05} max={Math.max(10.0, diagSensor * 1.1)} step={0.01}
                        onChange={v => updateAp('diameter', v)}
                        unit="mm"
                    />
                    
                    {(aperture.type === ApertureType.PINHOLE || aperture.type === ApertureType.ZONE_PLATE || aperture.type === ApertureType.PHOTON_SIEVE || isDotSize) && (
                        <button onClick={() => updateAp('diameter', parseFloat(simResult.optimalDiameter.toFixed(3)))}
                            className="w-full bg-science-900/20 text-science-400 border border-science-800/30 py-1.5 text-[10px] rounded hover:bg-science-900/40 transition-colors uppercase font-bold"
                        >
                            Set Optimal: {simResult.optimalDiameter.toFixed(3)}mm
                        </button>
                    )}

                    {isExtendedShape && (
                        <button onClick={() => updateAp('diameter', parseFloat(diagSensor.toFixed(2)))}
                            className="w-full bg-emerald-900/20 text-emerald-400 border border-emerald-900/30 py-1.5 text-[10px] rounded hover:bg-emerald-900/40 transition-colors uppercase font-bold"
                        >
                            Fit Sensor: {diagSensor.toFixed(1)}mm
                        </button>
                    )}
                </div>
            )}
                
            {renderApertureSpecifics()}
            
            <div className="pt-2 border-t border-white/5">
                <RangeControl label="Rotation" value={aperture.rotation || 0} min={0} max={360} step={1} onChange={v => updateAp('rotation', v)} unit="°" />
            </div>
          </div>
        </PanelModule>

        {/* --- SIMULATION SETTINGS --- */}
        <PanelModule title="Physics Engine" icon={<FilmIcon />}>
            <div className="bg-white/5 p-3 rounded-lg border border-white/10 mb-3">
                 <label className="flex items-center gap-3 cursor-pointer group">
                    <div className="relative">
                        <input type="checkbox" checked={aperture.renderDiffraction || false} onChange={e => updateAp('renderDiffraction', e.target.checked)} className="sr-only peer" />
                        <div className="w-10 h-6 bg-gray-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-science-600 peer-checked:after:bg-white peer-checked:after:border-white"></div>
                    </div>
                    <div>
                         <span className="text-xs font-bold text-gray-200 block group-hover:text-science-400 transition-colors">Diffraction (FFT)</span>
                         <span className="text-[9px] text-gray-500 block">Simulate wave interference (GPU Heavy)</span>
                    </div>
                </label>
            </div>

            <RangeControl label="ISO Sensitivity" value={camera.iso} min={100} max={25600} step={100} onChange={v => updateCam('iso', v)} />

            <div className="grid grid-cols-2 gap-2 pt-2">
                <label className="flex items-center gap-2 text-gray-400 cursor-pointer p-2 bg-white/5 rounded border border-white/10 hover:bg-white/10">
                    <div className="relative"><input type="checkbox" checked={aperture.usePolychromatic} onChange={e => updateAp('usePolychromatic', e.target.checked)} className="sr-only peer" /><div className="w-3 h-3 border border-gray-500 rounded peer-checked:bg-science-500 peer-checked:border-science-500"></div></div>
                    <span className="text-[10px] font-bold">POLYCHROME</span>
                </label>
                <label className="flex items-center gap-2 text-gray-400 cursor-pointer p-2 bg-white/5 rounded border border-white/10 hover:bg-white/10">
                    <div className="relative"><input type="checkbox" checked={aperture.useVignetting} onChange={e => updateAp('useVignetting', e.target.checked)} className="sr-only peer" /><div className="w-3 h-3 border border-gray-500 rounded peer-checked:bg-science-500 peer-checked:border-science-500"></div></div>
                    <span className="text-[10px] font-bold">VIGNETTING</span>
                </label>
            </div>
        </PanelModule>

        {/* --- SIMULATE BUTTON --- */}
        <button 
            onClick={isProcessing ? onCancel : onSimulate}
            className={`w-full py-4 rounded-xl font-bold text-sm transition-all active:scale-[0.98] shadow-2xl uppercase tracking-widest border ${
                isProcessing 
                ? 'bg-red-900/20 text-red-400 border-red-900/50 animate-pulse' 
                : 'bg-science-600 text-white hover:bg-science-500 border-science-400/30 hover:shadow-science-500/20'
            }`}
        >
            {isProcessing ? 'Processing FFT...' : 'Render Simulation'}
        </button>

        {/* --- METRICS --- */}
        <div className="bg-white/5 p-4 rounded-xl border border-white/10 mt-4 backdrop-blur-md">
          <div className="flex justify-between items-center border-b border-white/10 pb-2 mb-3">
              <h2 className="text-gray-500 text-[10px] uppercase font-bold tracking-wider">Metrics</h2>
              <div className={`w-2 h-2 rounded-full ${simResult.isDiffractionLimited ? 'bg-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.6)]' : 'bg-science-500 shadow-[0_0_8px_rgba(14,165,233,0.6)]'}`}></div>
          </div>
          <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-xs">
              <div>
                  <p className="text-gray-500 text-[9px] uppercase">Effective Aperture</p>
                  <p className="text-white font-mono text-sm">f/{simResult.fNumber.toFixed(1)}</p>
              </div>
              <div>
                  <p className="text-gray-500 text-[9px] uppercase">35mm Equiv</p>
                  <p className="text-white font-mono text-sm">{simResult.focalLength35mm.toFixed(1)}mm</p>
              </div>
               <div>
                  <p className="text-gray-500 text-[9px] uppercase">Field of View</p>
                  <p className="text-white font-mono text-sm">{simResult.fovH.toFixed(0)}° x {simResult.fovV.toFixed(0)}°</p>
              </div>
              <div>
                  <p className="text-gray-500 text-[9px] uppercase">Limiting Factor</p>
                  <p className={`font-mono text-[10px] font-bold ${simResult.isDiffractionLimited ? 'text-amber-500' : 'text-science-400'}`}>
                    {simResult.isDiffractionLimited ? 'DIFFRACTION' : 'GEOMETRY'}
                  </p>
              </div>
          </div>
        </div>

        {/* --- EXPOSURE ASSISTANT --- */}
        <PanelModule 
            title="Exposure Calc" 
            icon={<TimerIcon />} 
            isOpen={isExpCalcOpen} 
            onToggle={() => setIsExpCalcOpen(!isExpCalcOpen)}
        >
             <div className="space-y-3">
                <p className="text-[10px] text-gray-500">Meter Reading:</p>
                <div className="grid grid-cols-3 gap-2">
                     <div className="bg-black/40 border border-white/10 rounded p-1">
                        <label className="text-[9px] text-gray-600 block text-center">f/</label>
                        <input type="number" step="0.1" value={meterF} onChange={(e) => setMeterF(parseFloat(e.target.value))} className="w-full bg-transparent text-center text-xs text-white outline-none" />
                    </div>
                    <div className="bg-black/40 border border-white/10 rounded p-1">
                        <label className="text-[9px] text-gray-600 block text-center">1/t</label>
                        <input type="number" step="1" value={meterT} onChange={(e) => setMeterT(parseFloat(e.target.value))} className="w-full bg-transparent text-center text-xs text-white outline-none" />
                    </div>
                    <div className="bg-black/40 border border-white/10 rounded p-1">
                        <label className="text-[9px] text-gray-600 block text-center">ISO</label>
                        <input type="number" step="10" value={meterIso} onChange={(e) => setMeterIso(parseFloat(e.target.value))} className="w-full bg-transparent text-center text-xs text-white outline-none" />
                    </div>
                </div>
                <div className="bg-amber-900/10 p-2 rounded border border-amber-500/20 flex justify-between items-center">
                    <span className="text-amber-500 text-[10px] uppercase font-bold">Result</span>
                    <span className="text-amber-400 font-mono font-bold text-sm">{calculatedTime}</span>
                </div>
             </div>
        </PanelModule>

        {/* --- CAMERA BODY SECTION --- */}
        <PanelModule 
            title="Camera Body" 
            icon={<CameraIcon />} 
            isOpen={isCameraOpen} 
            onToggle={() => setIsCameraOpen(!isCameraOpen)}
        >
            <div className="space-y-4">
                <div>
                    <label className="text-gray-500 text-[10px] uppercase font-bold block mb-1">Preset Model</label>
                    <SelectControl value={camera.modelName || 'custom'} onChange={(e) => handlePresetChange(e.target.value)}>
                        <optgroup label="Digital">{CAMERA_PRESETS.filter(p => p.type === 'Digital').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                        <optgroup label="Film / Analog">{CAMERA_PRESETS.filter(p => p.type === 'Film').map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                        <option value="custom">Custom / Homemade</option>
                    </SelectControl>
                </div>

                <div className="grid grid-cols-2 gap-2">
                    <div className={`p-2 bg-black/40 rounded border border-white/10 ${!isCustomCamera ? 'opacity-50' : ''}`}>
                        <label className="text-[9px] text-gray-500 block mb-1">Sensor W (mm)</label>
                        <input type="number" disabled={!isCustomCamera} value={camera.sensorWidth} onChange={e => updateCam('sensorWidth', parseFloat(e.target.value))} className="w-full bg-transparent text-xs text-white outline-none font-mono" />
                    </div>
                    <div className={`p-2 bg-black/40 rounded border border-white/10 ${!isCustomCamera ? 'opacity-50' : ''}`}>
                        <label className="text-[9px] text-gray-500 block mb-1">Sensor H (mm)</label>
                        <input type="number" disabled={!isCustomCamera} value={camera.sensorHeight} onChange={e => updateCam('sensorHeight', parseFloat(e.target.value))} className="w-full bg-transparent text-xs text-white outline-none font-mono" />
                    </div>
                </div>

                <RangeControl label="Focal Length (Depth)" value={camera.focalLength} min={Math.max(1, flangeDist)} max={300} step={1} onChange={v => updateCam('focalLength', v)} unit="mm" />
                <div className="flex justify-between text-[9px] text-gray-600 font-mono px-1">
                    <span>Flange: {flangeDist}mm</span>
                    <span className={extension === 0 ? 'text-red-500' : 'text-gray-500'}>Ext: {extension.toFixed(1)}mm</span>
                </div>

                {isCustomCamera && (
                    <div className="mt-4 p-3 bg-cyan-900/10 rounded border border-cyan-900/30 space-y-3">
                        <div className="flex items-center gap-2 mb-2 border-b border-cyan-900/30 pb-2 text-cyan-500">
                            <DesignIcon /> <span className="text-[10px] uppercase font-bold">Design Assistant</span>
                        </div>
                        
                        <div>
                            <label className="text-cyan-700 text-[9px] uppercase font-bold block mb-1">Target Equiv.</label>
                            <div className="flex gap-2">
                                <div className="bg-black/40 border border-cyan-900/30 p-1.5 rounded flex-1">
                                    <input type="number" value={targetEquiv} onChange={(e) => setTargetEquiv(parseFloat(e.target.value))} className="w-full bg-transparent text-xs text-cyan-200 outline-none" />
                                </div>
                                <button onClick={() => updateCam('focalLength', targetEquiv / cropFactor)} className="bg-cyan-900/30 text-cyan-400 border border-cyan-800 px-3 rounded text-[9px] hover:bg-cyan-900/50 uppercase font-bold">Set</button>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </PanelModule>
        
      </div>
    </div>
  );
};

export default ControlPanel;
