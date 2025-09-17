/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

import React from 'react';
import { ArrowsHorizontalIcon } from './icons';

interface ComparisonSliderProps {
  position: number;
}

const ComparisonSlider: React.FC<ComparisonSliderProps> = ({ position }) => {
  return (
    <div
      className="absolute inset-y-0 z-40 w-1 flex items-center justify-center pointer-events-none select-none"
      style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
    >
      <div className="w-0.5 h-full bg-white/80 backdrop-blur-sm shadow-lg"></div>
      <div className="absolute top-1/2 -translate-y-1/2 w-10 h-10 bg-gray-900/60 border border-gray-700/80 rounded-full flex items-center justify-center shadow-lg">
        <ArrowsHorizontalIcon className="w-5 h-5 text-white" />
      </div>
    </div>
  );
};

export default ComparisonSlider;
