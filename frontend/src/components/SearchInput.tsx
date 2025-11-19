import { useState, useEffect, useRef } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Search, X, Clock, TrendingUp, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface SearchSuggestion {
  id: string;
  text: string;
  type: 'job_title' | 'company' | 'skill' | 'location' | 'recent' | 'popular';
  count?: number;
}

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  onSearch?: (query: string) => void;
  isLoading?: boolean;
  className?: string;
}

const SearchInput = ({
  value,
  onChange,
  placeholder = "Kërko punë, kompani, ose aftësi...",
  onSearch,
  isLoading = false,
  className = ""
}: SearchInputProps) => {
  const [isFocused, setIsFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const suggestionsRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Sample suggestions - in a real app, these would come from an API
  const popularSearches: SearchSuggestion[] = [
    { id: '1', text: 'Software Developer', type: 'job_title', count: 156 },
    { id: '2', text: 'Digital Marketing', type: 'job_title', count: 89 },
    { id: '3', text: 'React Developer', type: 'skill', count: 67 },
    { id: '4', text: 'Tirana', type: 'location', count: 234 },
    { id: '5', text: 'Remote Work', type: 'skill', count: 45 },
    { id: '6', text: 'Frontend Developer', type: 'job_title', count: 78 },
    { id: '7', text: 'Marketing Manager', type: 'job_title', count: 43 },
    { id: '8', text: 'JavaScript', type: 'skill', count: 92 }
  ];

  // Get recent searches from localStorage
  const getRecentSearches = (): SearchSuggestion[] => {
    try {
      const recent = localStorage.getItem('recentSearches');
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

  // Save search to recent searches
  const saveToRecentSearches = (query: string) => {
    if (!query.trim()) return;

    try {
      const recent = getRecentSearches().map(s => s.text);
      const updatedRecent = [query, ...recent.filter(s => s !== query)].slice(0, 5);
      localStorage.setItem('recentSearches', JSON.stringify(updatedRecent));
    } catch (error) {
      console.error('Error saving recent search:', error);
    }
  };

  // Filter suggestions based on input
  const getFilteredSuggestions = (query: string): SearchSuggestion[] => {
    if (!query.trim()) {
      const recent = getRecentSearches();
      return [
        ...recent.slice(0, 3),
        ...popularSearches.slice(0, 5)
      ];
    }

    const queryLower = query.toLowerCase();
    const filtered = popularSearches.filter(suggestion =>
      suggestion.text.toLowerCase().includes(queryLower)
    );

    return filtered.slice(0, 8);
  };

  // Load suggestions with debouncing
  useEffect(() => {
    const loadSuggestions = async () => {
      setLoadingSuggestions(true);

      // Simulate API delay
      await new Promise(resolve => setTimeout(resolve, 150));

      const filtered = getFilteredSuggestions(value);
      setSuggestions(filtered);
      setSelectedIndex(-1);
      setLoadingSuggestions(false);
    };

    if (isFocused) {
      const debounceTimer = setTimeout(loadSuggestions, 200);
      return () => clearTimeout(debounceTimer);
    } else {
      setSuggestions([]);
    }
  }, [value, isFocused]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isFocused || suggestions.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < suggestions.length - 1 ? prev + 1 : 0
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : suggestions.length - 1
        );
        break;

      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0) {
          handleSuggestionClick(suggestions[selectedIndex]);
        } else if (value.trim()) {
          handleSearch(value);
        }
        break;

      case 'Escape':
        setIsFocused(false);
        inputRef.current?.blur();
        break;
    }
  };

  // Handle suggestion click
  const handleSuggestionClick = (suggestion: SearchSuggestion) => {
    onChange(suggestion.text);
    setIsFocused(false);
    saveToRecentSearches(suggestion.text);

    if (onSearch) {
      onSearch(suggestion.text);
    }
  };

  // Handle search submission
  const handleSearch = (query: string) => {
    if (!query.trim()) return;

    saveToRecentSearches(query);
    setIsFocused(false);

    if (onSearch) {
      onSearch(query);
    }
  };

  // Clear search
  const handleClear = () => {
    onChange('');
    inputRef.current?.focus();
  };

  // Get icon for suggestion type
  const getSuggestionIcon = (type: SearchSuggestion['type']) => {
    switch (type) {
      case 'recent':
        return <Clock className="h-4 w-4 text-muted-foreground" />;
      case 'popular':
        return <TrendingUp className="h-4 w-4 text-muted-foreground" />;
      default:
        return <Search className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Highlight matching text
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

  return (
    <div className={`relative ${className}`}>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />

        <Input
          ref={inputRef}
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setIsFocused(true)}
          onBlur={(e) => {
            // Delay hiding suggestions to allow clicks
            setTimeout(() => {
              if (!suggestionsRef.current?.contains(e.relatedTarget as Node)) {
                setIsFocused(false);
              }
            }, 150);
          }}
          onKeyDown={handleKeyDown}
          className="pl-10 pr-20"
        />

        <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}

          {value && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 w-6 p-0 hover:bg-transparent"
            >
              <X className="h-4 w-4 text-muted-foreground hover:text-foreground" />
            </Button>
          )}
        </div>
      </div>

      {/* Suggestions Dropdown */}
      {isFocused && (
        <Card className="absolute top-full left-0 right-0 mt-2 z-50 shadow-lg border">
          <CardContent className="p-0">
            {loadingSuggestions ? (
              <div className="flex items-center justify-center py-4">
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">Duke ngarkuar sugjerime...</span>
              </div>
            ) : suggestions.length > 0 ? (
              <div ref={suggestionsRef} className="max-h-64 overflow-y-auto">
                {!value.trim() && (
                  <>
                    {getRecentSearches().length > 0 && (
                      <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b">
                        Kërkimet e fundit
                      </div>
                    )}
                    {getRecentSearches().slice(0, 3).map((suggestion, index) => (
                      <div
                        key={suggestion.id}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-muted cursor-pointer transition-colors ${
                          index === selectedIndex ? 'bg-muted' : ''
                        }`}
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        {getSuggestionIcon(suggestion.type)}
                        <span className="flex-1 text-sm">{suggestion.text}</span>
                      </div>
                    ))}

                    {popularSearches.length > 0 && (
                      <div className="px-4 py-2 text-xs font-medium text-muted-foreground border-b border-t">
                        Kërkime popullore
                      </div>
                    )}
                  </>
                )}

                {suggestions
                  .filter(s => value.trim() || s.type !== 'recent')
                  .map((suggestion, index) => {
                    const actualIndex = value.trim() ? index : index + getRecentSearches().slice(0, 3).length;
                    return (
                      <div
                        key={suggestion.id}
                        className={`flex items-center gap-3 px-4 py-3 hover:bg-muted cursor-pointer transition-colors ${
                          actualIndex === selectedIndex ? 'bg-muted' : ''
                        }`}
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        {getSuggestionIcon(suggestion.type)}
                        <div className="flex-1">
                          <div className="text-sm">
                            {highlightMatch(suggestion.text, value)}
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
            ) : value.trim().length > 0 ? (
              <div className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nuk ka sugjerime për "{value}"
              </div>
            ) : null}
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default SearchInput;