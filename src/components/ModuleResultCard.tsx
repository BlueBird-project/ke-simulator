import React from 'react';
import { LucideIcon } from 'lucide-react';

interface ModuleResultCardProps {
  title: string;
  icon: LucideIcon;
  accent: 'blue' | 'teal' | 'purple' | 'green';
  lines: { label: string; value: string }[];
}

const accentClasses: Record<ModuleResultCardProps['accent'], string> = {
  blue: 'border-blue-300 bg-blue-50 text-blue-900',
  teal: 'border-teal-300 bg-teal-50 text-teal-900',
  purple: 'border-purple-300 bg-purple-50 text-purple-900',
  green: 'border-green-300 bg-green-50 text-green-900'
};

/**
 * Renders one architecture "box" (Market/Digital Twin/Flexibility Manager/
 * Trading Manager) as its own visual module, instead of one flat result list.
 */
export const ModuleResultCard: React.FC<ModuleResultCardProps> = ({ title, icon: Icon, accent, lines }) => {
  return (
    <div className={`rounded-lg border-2 p-4 ${accentClasses[accent]}`}>
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} />
        <h5 className="text-xs font-bold uppercase tracking-wide">{title}</h5>
      </div>
      <dl className="text-xs space-y-1.5">
        {lines.map(line => (
          <div key={line.label} className="flex justify-between gap-3">
            <dt className="opacity-80">{line.label}</dt>
            <dd className="font-semibold text-right">{line.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};
