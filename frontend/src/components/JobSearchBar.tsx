import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, MapPin, X, Clock, TrendingUp, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SearchSuggestion {
  id: string;
  text: string;
  type: 'job_title' | 'company' | 'skill' | 'location' | 'recent' | 'popular';
  count?: number;
}

interface JobSearchBarProps {
  jobQuery: string;
  locationQuery: string;
  onJobQueryChange: (value: string) => void;
  onLocationQueryChange: (value: string) => void;
  onSearch?: (jobQuery: string, locationQuery: string) => void;
  isLoading?: boolean;
  className?: string;
  placeholder?: string;
  locationPlaceholder?: string;
}

const JobSearchBar = ({
  jobQuery,
  locationQuery,
  onJobQueryChange,
  onLocationQueryChange,
  onSearch,
  isLoading = false,
  className = "",
  placeholder = "Titulli i punës, aftësitë, kompania",
  locationPlaceholder = "Qyteti"
}: JobSearchBarProps) => {
  const [isFocused, setIsFocused] = useState<'job' | 'location' | null>(null);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const jobInputRef = useRef<HTMLInputElement>(null);
  const locationInputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Sample suggestions - in real app, from API
  const popularJobSearches: SearchSuggestion[] = [
    { id: '1', text: 'Software Developer', type: 'job_title', count: 156 },
    { id: '2', text: 'Digital Marketing', type: 'job_title', count: 89 },
    { id: '3', text: 'React Developer', type: 'skill', count: 67 },
    { id: '4', text: 'Frontend Developer', type: 'job_title', count: 78 },
    { id: '5', text: 'Marketing Manager', type: 'job_title', count: 43 },
    { id: '6', text: 'JavaScript', type: 'skill', count: 92 }
  ];

  const popularLocationSearches: SearchSuggestion[] = [
    { id: '1', text: 'Tirana', type: 'location', count: 234 },
    { id: '2', text: 'Durrës', type: 'location', count: 89 },
    { id: '3', text: 'Vlorë', type: 'location', count: 56 },
    { id: '4', text: 'Shkodër', type: 'location', count: 45 },
    { id: '5', text: 'Remote', type: 'location', count: 123 }
  ];

  // Get recent searches from localStorage
  const getRecentSearches = (type: 'job' | 'location'): SearchSuggestion[] => {
    try {
      const key = type === 'job' ? 'recentJobSearches' : 'recentLocationSearches';
      const recent = localStorage.getItem(key);
      if (recent) {
        const searches = JSON.parse(recent);
        return searches.map((search: string, index: number) => ({
          id: `recent-${index}`,
          text: search,
          type: 'recent' as const
        }));
      }
    } catch (error) {
      console.error('Error loading recent searches:', error);
    }
    return [];
  };

  // Save search to recent
  const saveToRecentSearches = (query: string, type: 'job' | 'location') => {
    if (!query.trim()) return;

    try {
      const key = type === 'job' ? 'recentJobSearches' : 'recentLocationSearches';
      const recent = getRecentSearches(type).map(s => s.text);
      const updatedRecent = [query, ...recent.filter(s => s !== query)].slice(0, 5);
      localStorage.setItem(key, JSON.stringify(updatedRecent));
    } catch (error) {
      console.error('Error saving recent search:', error);
    }
  };

  // Filter suggestions
  const getFilteredSuggestions = (query: string, type: 'job' | 'location'): SearchSuggestion[] => {
    const popularList = type === 'job' ? popularJobSearches : popularLocationSearches;

    if (!query.trim()) {
      const recent = getRecentSearches(type);
      return [
        ...recent.slice(0, 3),
        ...popularList.slice(0, 5)
      ];
    }

    const queryLower = query.toLowerCase();
    const filtered = popularList.filter(suggestion =>
      suggestion.text.toLowerCase().includes(queryLower)
    );

    return filtered.slice(0, 8);
  };

  // Load suggestions with debouncing
  useEffect(() => {
    if (!isFocused) {
      setSuggestions([]);
      return;
    }

    const loadSuggestions = async () => {
      setLoadingSuggestions(true);
      await new Promise(resolve => setTimeout(resolve, 150));

      const query = isFocused === 'job' ? jobQuery : locationQuery;
      const filtered = getFilteredSuggestions(query, isFocused);
      setSuggestions(filtered);
      setSelectedIndex(-1);
      setLoadingSuggestions(false);
    };

    const debounceTimer = setTimeout(loadSuggestions, 200);
    return () => clearTimeout(debounceTimer);
  }, [jobQuery, locationQuery, isFocused]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent, fieldType: 'job' | 'location') => {
    if (!isFocused || suggestions.length === 0) {
      if (e.key === 'Enter') {
        handleSearch();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => prev < suggestions.length - 1 ? prev + 1 : 0);
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => prev > 0 ? prev - 1 : suggestions.length - 1);
        break;

      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSuggestionClick(suggestions[selectedIndex], fieldType);
        } else {
          handleSearch();
        }
        break;

      case 'Escape':
        setIsFocused(null);
        break;
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: SearchSuggestion, fieldType: 'job' | 'location') => {
    if (fieldType === 'job') {
      onJobQueryChange(suggestion.text);
      saveToRecentSearches(suggestion.text, 'job');
    } else {
      onLocationQueryChange(suggestion.text);
      saveToRecentSearches(suggestion.text, 'location');
    }
    setIsFocused(null);
  };

  // Handle search
  const handleSearch = () => {
    if (jobQuery.trim()) {
      saveToRecentSearches(jobQuery, 'job');
    }
    if (locationQuery.trim()) {
      saveToRecentSearches(locationQuery, 'location');
    }

    if (onSearch) {
      onSearch(jobQuery, locationQuery);
    }
    setIsFocused(null);
  };

  // Clear field
  const handleClear = (fieldType: 'job' | 'location') => {
    if (fieldType === 'job') {
      onJobQueryChange('');
      jobInputRef.current?.focus();
    } else {
      onLocationQueryChange('');
      locationInputRef.current?.focus();
    }
  };

  // Get icon for suggestion
  const getSuggestionIcon = (type: SearchSuggestion['type']) => {
    switch (type) {
      case 'recent':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'popular':
        return <TrendingUp className="h-4 w-4 text-muted-foreground" />;
      case 'location':
        return <MapPin className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Search className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Highlight match
  const highlightMatch = (text: string, query: string) => {
    if (!query.trim()) return text;

    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <span key={index} className="font-semibold text-primary">
          {part}
        </span>
      ) : (
        part
      )
    );
  };

  const currentQuery = isFocused === 'job' ? jobQuery : locationQuery;
  const recentSearches = getRecentSearches(isFocused || 'job');

  return (
    <div className={`relative w-full ${className}`}>
      <form onSubmit={(e) => { e.preventDefault(); handleSearch(); }}>
        <div className="flex items-stretch bg-white border-2 border-gray-200 rounded-lg shadow-sm hover:shadow-md hover:border-gray-300 transition-all duration-200 overflow-hidden focus-within:border-primary focus-within:shadow-lg">
          {/* Job Title Input */}
          <div className="flex-1 flex items-center px-4 py-3 relative">
            <Search className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0" />
            <Input
              ref={jobInputRef}
              type="text"
              placeholder={placeholder}
              value={jobQuery}
              onChange={(e) => onJobQueryChange(e.target.value)}
              onFocus={() => setIsFocused('job')}
              onBlur={(e) => {
                setTimeout(() => {
                  if (!suggestionsRef.current?.contains(e.relatedTarget as Node)) {
                    setIsFocused(null);
                  }
                }, 150);
              }}
              onKeyDown={(e) => handleKeyDown(e, 'job')}
              className="border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-0 h-auto text-base placeholder:text-gray-400"
            />
            {jobQuery && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleClear('job')}
                className="h-6 w-6 p-0 hover:bg-transparent ml-2"
              >
                <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
              </Button>
            )}
          </div>

          {/* Vertical Separator */}
          <div className="w-px bg-gray-200 my-2" />

          {/* Location Input */}
          <div className="flex-1 flex items-center px-4 py-3 relative">
            <MapPin className="h-5 w-5 text-gray-400 mr-3 flex-shrink-0" />
            <Input
              ref={locationInputRef}
              type="text"
              placeholder={locationPlaceholder}
              value={locationQuery}
              onChange={(e) => onLocationQueryChange(e.target.value)}
              onFocus={() => setIsFocused('location')}
              onBlur={(e) => {
                setTimeout(() => {
                  if (!suggestionsRef.current?.contains(e.relatedTarget as Node)) {
                    setIsFocused(null);
                  }
                }, 150);
              }}
              onKeyDown={(e) => handleKeyDown(e, 'location')}
              className="border-none shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 px-0 py-0 h-auto text-base placeholder:text-gray-400"
            />
            {locationQuery && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => handleClear('location')}
                className="h-6 w-6 p-0 hover:bg-transparent ml-2"
              >
                <X className="h-3.5 w-3.5 text-gray-400 hover:text-gray-600" />
              </Button>
            )}
          </div>

          {/* Search Button */}
          <Button
            type="submit"
            size="lg"
            className="rounded-none rounded-r-lg bg-black hover:bg-gray-800 text-white px-8 py-6 h-auto font-medium"
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              'Kërko'
            )}
          </Button>
        </div>
      </form>

      {/* Suggestions Dropdown */}
      {isFocused && (
        <Card className="absolute top-full left-0 right-0 mt-2 z-50 shadow-lg border-2">
          <CardContent className="p-0">
            {loadingSuggestions ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Duke ngarkuar...</span>
              </div>
            ) : suggestions.length > 0 ? (
              <div ref={suggestionsRef} className="max-h-64 overflow-y-auto">
                {!currentQuery.trim() && recentSearches.length > 0 && (
                  <>
                    <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b">
                      Kërkimet e fundit
                    </div>
                    {recentSearches.slice(0, 3).map((suggestion, index) => (
                      <div
                        key={suggestion.id}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-muted cursor-pointer transition-colors ${
                          index === selectedIndex ? 'bg-muted' : ''
                        }`}
                        onClick={() => handleSuggestionClick(suggestion, isFocused || 'job')}
                      >
                        {getSuggestionIcon(suggestion.type)}
                        <span className="flex-1 text-sm">{suggestion.text}</span>
                      </div>
                    ))}
                    <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-t">
                      Kërkime popullore
                    </div>
                  </>
                )}

                {suggestions
                  .filter(s => currentQuery.trim() || s.type !== 'recent')
                  .map((suggestion, index) => {
                    const actualIndex = currentQuery.trim() ? index : index + recentSearches.slice(0, 3).length;
                    return (
                      <div
                        key={suggestion.id}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-muted cursor-pointer transition-colors ${
                          actualIndex === selectedIndex ? 'bg-muted' : ''
                        }`}
                        onClick={() => handleSuggestionClick(suggestion, isFocused || 'job')}
                      >
                        {getSuggestionIcon(suggestion.type)}
                        <div className="flex-1">
                          <div className="text-sm">
                            {highlightMatch(suggestion.text, currentQuery)}
                          </div>
                          {suggestion.count && (
                            <div className="text-xs text-muted-foreground">
                              {suggestion.count} punë
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            ) : currentQuery.trim().length > 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nuk ka sugjerime për "{currentQuery}"
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default JobSearchBar;
