/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React, { useState } from 'react';
import { CollectionIcon } from './icons';

interface AdjustmentPanelProps {
  onApplyAdjustment: (prompt: string) => void;
  onApplyToAll?: (prompt: string) => void;
  isLoading: boolean;
  batchMode: boolean;
}

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


const AdjustmentPanel: React.FC<AdjustmentPanelProps> = ({ onApplyAdjustment, onApplyToAll, isLoading, batchMode }) => {
  const [selectedPresetPrompt, setSelectedPresetPrompt] = useState<string | null>(null);
  const [customPrompt, setCustomPrompt] = useState('');
  const [brightness, setBrightness] = useState(0);
  const [contrast, setContrast] = useState(0);

  const presets = [
    { name: 'Blur Background', prompt: 'Apply a realistic depth-of-field effect, making the background blurry while keeping the main subject in sharp focus.' },
    { name: 'Enhance Details', prompt: 'Slightly enhance the sharpness and details of the image without making it look unnatural.' },
    { name: 'Warmer Lighting', prompt: 'Adjust the color temperature to give the image warmer, golden-hour style lighting.' },
    { name: 'Studio Light', prompt: 'Add dramatic, professional studio lighting to the main subject.' },
  ];

  const resetSliders = () => {
    setBrightness(0);
    setContrast(0);
  };

  const handleSliderChange = (type: 'brightness' | 'contrast', value: number) => {
      setSelectedPresetPrompt(null);
      setCustomPrompt('');
      if (type === 'brightness') setBrightness(value);
      if (type === 'contrast') setContrast(value);
  };

  const handlePresetClick = (prompt: string) => {
    setSelectedPresetPrompt(prompt);
    setCustomPrompt('');
    resetSliders();
  };

  const handleCustomChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCustomPrompt(e.target.value);
    setSelectedPresetPrompt(null);
    resetSliders();
  };
  
  let sliderPrompt = '';
  const hasSliderValues = brightness !== 0 || contrast !== 0;

  if (hasSliderValues) {
      const parts = [];
      if (brightness !== 0) parts.push(`adjust brightness by ${brightness}`);
      if (contrast !== 0) parts.push(`adjust contrast by ${contrast}`);
      sliderPrompt = `Perform a photorealistic adjustment: ${parts.join(' and ')}.`;
  }

  const activePrompt = selectedPresetPrompt || customPrompt || sliderPrompt;

  const handleApply = () => {
    if (activePrompt) {
      onApplyAdjustment(activePrompt);
    }
  };
  
  const handleApplyToAll = () => {
    if (activePrompt && onApplyToAll) {
      onApplyToAll(activePrompt);
    }
  }

  return (
    <div className="w-full bg-gray-800/50 border border-gray-700 rounded-lg p-6 flex flex-col gap-5 animate-fade-in backdrop-blur-sm">
      <h3 className="text-lg font-semibold text-center text-gray-300">Apply a Professional Adjustment</h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 p-5 bg-gray-900/30 rounded-lg">
        <ControlSlider label="Brightness" value={brightness} onChange={v => handleSliderChange('brightness', v)} onReset={() => handleSliderChange('brightness', 0)} isLoading={isLoading} />
        <ControlSlider label="Contrast" value={contrast} onChange={v => handleSliderChange('contrast', v)} onReset={() => handleSliderChange('contrast', 0)} isLoading={isLoading} />
      </div>

      <div className="flex items-center gap-4 my-2">
        <div className="flex-grow border-t border-gray-600"></div>
        <span className="text-sm font-semibold text-gray-400">OR</span>
        <div className="flex-grow border-t border-gray-600"></div>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
        {presets.map(preset => (
          <button
            key={preset.name}
            onClick={() => handlePresetClick(preset.prompt)}
            disabled={isLoading}
            className={`w-full text-center bg-white/10 border border-transparent text-gray-200 font-semibold py-3 px-4 rounded-md transition-all duration-200 ease-in-out hover:bg-white/20 hover:border-white/20 active:scale-95 text-base disabled:opacity-50 disabled:cursor-not-allowed ${selectedPresetPrompt === preset.prompt ? 'ring-2 ring-offset-2 ring-offset-gray-800 ring-blue-500' : ''}`}
          >
            {preset.name}
          </button>
        ))}
      </div>

      <input
        type="text"
        value={customPrompt}
        onChange={handleCustomChange}
        placeholder="Or describe an adjustment (e.g., 'change background to a forest')"
        className="flex-grow bg-gray-800 border border-gray-600 text-gray-200 rounded-lg p-4 focus:ring-2 focus:ring-blue-500 focus:outline-none transition w-full disabled:cursor-not-allowed disabled:opacity-60 text-base"
        disabled={isLoading}
      />

      {activePrompt && (
        <div className="animate-fade-in flex flex-col sm:flex-row gap-3 pt-2">
            <button
                onClick={handleApply}
                className="w-full bg-gradient-to-br from-blue-600 to-blue-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-blue-500/20 hover:shadow-xl hover:shadow-blue-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-blue-800 disabled:to-blue-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none"
                disabled={isLoading || !activePrompt.trim()}
            >
                Apply to Current
            </button>
            {batchMode && onApplyToAll && (
              <button
                onClick={handleApplyToAll}
                className="w-full bg-gradient-to-br from-green-600 to-green-500 text-white font-bold py-4 px-6 rounded-lg transition-all duration-300 ease-in-out shadow-lg shadow-green-500/20 hover:shadow-xl hover:shadow-green-500/40 hover:-translate-y-px active:scale-95 active:shadow-inner text-base disabled:from-green-800 disabled:to-green-700 disabled:shadow-none disabled:cursor-not-allowed disabled:transform-none flex items-center justify-center gap-2"
                disabled={isLoading || !activePrompt.trim()}
              >
                <CollectionIcon className="w-5 h-5" />
                Apply to All
              </button>
            )}
        </div>
      )}
    </div>
  );
};

export default AdjustmentPanel;
