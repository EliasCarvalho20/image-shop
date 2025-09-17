/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { LevelsIcon, CurvesIcon, SelectiveColorIcon, CollectionIcon } from './icons';

interface AdvancedPanelProps {
  onApplyAdjustment: (prompt: string) => void;
  onApplyToAll?: (prompt: string) => void;
  isLoading: boolean;
  batchMode: boolean;
}

type AdvancedTool = 'levels' | 'curves' | 'selective-color';

// Reusable slider component
const ControlSlider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  onReset?: () => void;
  min?: number;
  max?: number;
  isLoading: boolean;
}> = ({ label, value, onChange, onReset, min = -100, max = 100, isLoading }) => (
    <div className="flex flex-col gap-2">
        <div className="flex justify-between items-center">
            <label className="text-sm font-medium text-gray-400">{label}</label>
            <span
                onClick={onReset}
                className={`text-sm font-mono bg-gray-900/50 text-gray-200 px-2 py-1 rounded-md transition-colors ${onReset ? 'cursor-pointer hover:bg-gray-700' : ''}`}
                title={onReset ? 'Click to reset' : ''}
            >
                {value > 0 ? `+${value}` : value}
            </span>
        </div>
        <input
            type="range"
            min={min}
            max={max}
            value={value}
            onChange={(e) => onChange(parseInt(e.target.value, 10))}
            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer range-lg accent-blue-500 disabled:opacity-50"
            disabled={isLoading}
        />
    </div>
);

const AdvancedPanel: React.FC<AdvancedPanelProps> = ({ onApplyAdjustment, onApplyToAll, isLoading, batchMode }) => {
  const [activeTool, setActiveTool] = useState<AdvancedTool>('levels');

  // State for Levels
  const [levels, setLevels] = useState({ shadows: 0, midtones: 0, highlights: 0 });

  // State for Curves
  const [curvePreset, setCurvePreset] = useState<string | null>(null);
  
  // State for Selective Color
  const [selectedColor, setSelectedColor] = useState('Reds');
  const [colorAdjust, setColorAdjust] = useState({ hue: 0, saturation: 0, lightness: 0 });
  
  const generatePrompt = () => {
    switch (activeTool) {
      case 'levels':
        return `Perform a levels adjustment. Adjust shadows by ${levels.shadows} units, midtones by ${levels.midtones} units, and highlights by ${levels.highlights} units. The adjustment should be photorealistic and maintain the original character of the image.`;
      case 'curves':
        if (curvePreset) {
            return `Apply a "${curvePreset}" tonal curve to the image to adjust contrast and brightness.`;
        }
        break;
      case 'selective-color':
        return `Perform a selective color adjustment on the ${selectedColor.toLowerCase()} color range. Apply a hue shift of ${colorAdjust.hue} degrees, adjust saturation by ${colorAdjust.saturation}%, and adjust lightness by ${colorAdjust.lightness}%. Ensure the changes blend naturally with the rest of the image.`;
    }
    return '';
  }
  
  const handleApply = () => {
    const prompt = generatePrompt();
    if (prompt) {
      onApplyAdjustment(prompt);
    }
  };

  const handleApplyToAll = () => {
    const prompt = generatePrompt();
    if (prompt && onApplyToAll) {
      onApplyToAll(prompt);
    }
  }

  const isApplyDisabled = () => {
      if (isLoading) return true;
      switch (activeTool) {
          case 'levels':
              return levels.shadows === 0 && levels.midtones === 0 && levels.highlights === 0;
          case 'curves':
              return !curvePreset;
          case 'selective-color':
              return colorAdjust.hue === 0 && colorAdjust.saturation === 0 && colorAdjust.lightness === 0;
          default:
              return true;
      }
  };

  const toolConfig = [
      { name: 'levels', icon: LevelsIcon, label: 'Levels' },
      { name: 'curves', icon: CurvesIcon, label: 'Curves' },
      { name: 'selective-color', icon: SelectiveColorIcon, label: 'Selective Color' }
  ];

  const curvePresets = ['Increase Contrast (S-Curve)', 'Decrease Contrast (Inverted S-Curve)', 'Lighten Shadows', 'Darken Highlights', 'Vintage Fade'];
  const selectiveColors = [
      { name: 'Reds', bg: 'bg-red-500', ring: 'ring-red-400' },
      { name: 'Yellows', bg: 'bg-yellow-500', ring: 'ring-yellow-400' },
      { name: 'Greens', bg: 'bg-green-500', ring: 'ring-green-400' },
      { name: 'Cyans', bg: 'bg-cyan-500', ring: 'ring-cyan-400' },
      { name: 'Blues', bg: 'bg-blue-500', ring: 'ring-blue-400' },
      { name: 'Magentas', bg: 'bg-pink-500', ring: 'ring-pink-400' },
  ];
  
  const renderToolUI = () => {
    switch(activeTool) {
        case 'levels':
            return (
                <div className="flex flex-col gap-6 animate-fade-in">
                    <p className="text-sm text-center text-gray-400">Adjust the tonal range of the image.</p>
                    <ControlSlider label="Shadows" value={levels.shadows} onChange={v => setLevels({...levels, shadows: v})} onReset={() => setLevels({...levels, shadows: 0})} isLoading={isLoading}/>
                    <ControlSlider label="Midtones" value={levels.midtones} onChange={v => setLevels({...levels, midtones: v})} onReset={() => setLevels({...levels, midtones: 0})} isLoading={isLoading}/>
                    <ControlSlider label="Highlights" value={levels.highlights} onChange={v => setLevels({...levels, highlights: v})} onReset={() => setLevels({...levels, highlights: 0})} isLoading={isLoading}/>
                </div>
            );
        case 'curves':
            return (
                 <div className="flex flex-col gap-4 animate-fade-in">
                    <p className="text-sm text-center text-gray-400">Apply a preset tonal curve to adjust contrast.</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {curvePresets.map(preset => (
                             <button
                                key={preset}
                                onClick={() => setCurvePreset(preset)}
                                disabled={isLoading}
                                className={`w-full text-center bg-white/10 border border-transparent text-gray-200 font-semibold py-3 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/20 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed ${curvePreset === preset ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-blue-500' : ''}`}
                            >
                                {preset}
                            </button>
                        ))}
                    </div>
                </div>
            );
        case 'selective-color':
            return (
                 <div className="flex flex-col gap-6 animate-fade-in">
                    <p className="text-sm text-center text-gray-400">Select a color to adjust its hue, saturation, and lightness.</p>
                     <div className="flex flex-wrap items-center justify-center gap-3">
                        {selectiveColors.map(color => (
                            <button 
                                key={color.name}
                                onClick={() => {
                                    setSelectedColor(color.name);
                                    setColorAdjust({ hue: 0, saturation: 0, lightness: 0 });
                                }}
                                className={`w-12 h-12 rounded-full transition-transform duration-200 active:scale-90 disabled:opacity-50 ${color.bg} ${selectedColor === color.name ? `ring-4 ring-offset-2 ring-offset-gray-800 ${color.ring}` : 'hover:scale-110'}`}
                                aria-label={`Select ${color.name}`}
                                disabled={isLoading}
                            />
                        ))}
                    </div>
                    <div className="border-t border-gray-700/50 my-2"></div>
                    <ControlSlider label="Hue Shift" value={colorAdjust.hue} onChange={v => setColorAdjust({...colorAdjust, hue: v})} onReset={() => setColorAdjust({...colorAdjust, hue: 0})} min={-180} max={180} isLoading={isLoading}/>
                    <ControlSlider label="Saturation" value={colorAdjust.saturation} onChange={v => setColorAdjust({...colorAdjust, saturation: v})} onReset={() => setColorAdjust({...colorAdjust, saturation: 0})} isLoading={isLoading}/>
                    <ControlSlider label="Lightness" value={colorAdjust.lightness} onChange={v => setColorAdjust({...colorAdjust, lightness: v})} onReset={() => setColorAdjust({...colorAdjust, lightness: 0})} isLoading={isLoading}/>
                </div>
            );
        default:
            return null;
    }
  }

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-4 flex flex-col gap-4 animate-fade-in backdrop-blur-sm">
      <div className="p-1 bg-gray-900/50 rounded-lg flex w-full">
        {toolConfig.map(tool => (
             <button
                key={tool.name}
                onClick={() => setActiveTool(tool.name as AdvancedTool)}
                className={`w-1/3 py-2 px-4 rounded-md text-base font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${activeTool === tool.name ? 'bg-blue-600 text-white shadow' : 'text-gray-300 hover:bg-white/10'}`}
            >
                <tool.icon className="w-5 h-5" />
                {tool.label}
            </button>
        ))}
      </div>
      
      <div className="p-4 min-h-[200px]">
          {renderToolUI()}
      </div>
        <div className="animate-fade-in flex flex-col sm:flex-row gap-2 pt-2">
            <button
                onClick={handleApply}
                disabled={isApplyDisabled()}
                className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-gray-600 disabled:to-gray-500 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
            >
                Apply to Current
            </button>
             {batchMode && onApplyToAll && (
              <button
                onClick={handleApplyToAll}
                disabled={isApplyDisabled()}
                className="w-full bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-green-800 disabled:to-green-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
              >
                <CollectionIcon className="w-5 h-5" />
                Apply to All
              </button>
            )}
        </div>
    </div>
  );
};

export default AdvancedPanel;