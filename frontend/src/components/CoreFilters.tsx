import React from 'react';
import { Button } from '@/components/ui/button';
import { Filter } from 'lucide-react';
import {
  Home,
  Clock,
  Building2,
  Calendar,
  Globe,
  Star
} from 'lucide-react';

interface CoreFiltersProps {
  filters: {
    diaspora: boolean;
    ngaShtepια: boolean;
    partTime: boolean;
    administrata: boolean;
    sezonale: boolean;
  };
  onFilterChange: (filterKey: string, value: boolean) => void;
  className?: string;
}

const CoreFilters: React.FC<CoreFiltersProps> = ({
  filters,
  onFilterChange,
  className = ""
}) => {
  const coreFilters = [
    {
      key: 'diaspora',
      label: 'Diaspora',
      icon: Globe
    },
    {
      key: 'ngaShtepια',
      label: 'Nga shtëpia',
      icon: Home
    },
    {
      key: 'partTime',
      label: 'Part Time',
      icon: Clock
    },
    {
      key: 'administrata',
      label: 'Administrata',
      icon: Building2
    },
    {
      key: 'sezonale',
      label: 'Sezonale',
      icon: Star
    }
  ];

  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    <div className={`space-y-6 ${className}`}>
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-4">Filtro Sipas Kategorisë</h3>
        <div className="space-y-3">
          {coreFilters.map((category) => {
            const Icon = category.icon;
            const isSelected = filters[category.key as keyof typeof filters];

            return (
              <Button
                key={category.key}
                variant={isSelected ? "default" : "outline"}
                className={`w-full justify-start gap-3 rounded-xl transition-all duration-200 ${
                  isSelected
                    ? 'bg-primary text-primary-foreground shadow-md'
                    : 'hover:bg-primary/5 border-gray-200'
                }`}
                onClick={() => onFilterChange(category.key, !isSelected)}
              >
                <Icon className="h-4 w-4" />
                <span>{category.label}</span>
              </Button>
            );
          })}
        </div>
      </div>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Button
          variant="outline"
          className="w-full"
          onClick={() => {
            Object.keys(filters).forEach(key => {
              onFilterChange(key, false);
            });
          }}
        >
          <Filter className="mr-2 h-4 w-4" />
          Pastro Filtrat
        </Button>
      )}
    </div>
  );
};

export default CoreFilters;