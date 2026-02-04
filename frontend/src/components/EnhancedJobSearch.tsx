import React, { useState } from 'react';
import { Input } from './ui/input';
import { Button } from './ui/button';
import { Search, MapPin } from 'lucide-react';

interface EnhancedJobSearchProps {
  onSearch: (query: string, location: string) => void;
  className?: string;
  defaultQuery?: string;
  defaultLocation?: string;
}

const EnhancedJobSearch: React.FC<EnhancedJobSearchProps> = ({
  onSearch,
  className = '',
  defaultQuery = '',
  defaultLocation = ''
}) => {
  const [jobTitle, setJobTitle] = useState(defaultQuery);
  const [location, setLocation] = useState(defaultLocation);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(jobTitle, location);
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSearch(jobTitle, location);
    }
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={`w-full ${className}`}
    >
      <div className="flex items-stretch bg-white border border-gray-300 rounded-lg shadow-sm hover:shadow-md transition-shadow duration-200 overflow-hidden">
        {/* Job Title Input */}
        <div className="flex-1 flex items-center px-4 py-3">
          <Search className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0" />
          <Input
            type="text"
            placeholder="Titulli i punës"
            value={jobTitle}
            onChange={(e) => setJobTitle(e.target.value)}
            onKeyPress={handleKeyPress}
            className="border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-0 h-auto text-base placeholder:text-gray-400"
          />
        </div>

        {/* Vertical Separator */}
        <div className="w-px bg-gray-300 my-2" />

        {/* Location Input */}
        <div className="flex-1 flex items-center px-4 py-3">
          <MapPin className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0" />
          <Input
            type="text"
            placeholder="Vendndodhja"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            onKeyPress={handleKeyPress}
            className="border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-0 h-auto text-base placeholder:text-gray-400"
          />
        </div>

        {/* Search Button */}
        <Button
          type="submit"
          size="lg"
          className="rounded-none rounded-r-lg bg-black hover:bg-gray-800 text-white px-8 py-6 h-auto font-medium"
        >
          Kërko
        </Button>
      </div>
    </form>
  );
};

export default EnhancedJobSearch;
