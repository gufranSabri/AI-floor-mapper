import { useCallback, useEffect, useRef, useState } from 'react';

function LocationSearch({ onSelect }) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const debounceRef = useRef(null);
  const containerRef = useRef(null);

  const fetchSuggestions = useCallback(async (q) => {
    if (!q.trim()) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    setSearching(true);
    try {
      const response = await fetch(`/api/geocode?q=${encodeURIComponent(q)}`);
      const data = await response.json();
      if (response.ok && data.results) {
        setSuggestions(data.results);
        setOpen(true);
        setActiveIndex(-1);
      } else {
        setSuggestions([]);
        setOpen(false);
      }
    } catch {
      setSuggestions([]);
      setOpen(false);
    } finally {
      setSearching(false);
    }
  }, []);

  const handleChange = (event) => {
    const value = event.target.value;
    setQuery(value);
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchSuggestions(value), 350);
  };

  const handleSelect = (result) => {
    setQuery(result.display_name);
    setSuggestions([]);
    setOpen(false);
    onSelect(result);
  };

  const handleKeyDown = (event) => {
    if (!open || suggestions.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, suggestions.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      handleSelect(suggestions[activeIndex]);
    } else if (event.key === 'Escape') {
      setOpen(false);
    }
  };

  useEffect(() => {
    const onClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  return (
    <div className="search-bar" ref={containerRef}>
      <label className="sr-only" htmlFor="location-search">Search location</label>
      <input
        id="location-search"
        value={query}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Search a city, building, or address…"
        autoComplete="off"
        aria-autocomplete="list"
        aria-expanded={open}
        aria-controls="location-suggestions"
      />
      {searching && <span className="search-bar__spinner" aria-hidden="true" />}
      {open && suggestions.length > 0 && (
        <ul id="location-suggestions" className="search-suggestions" role="listbox">
          {suggestions.map((result, index) => (
            <li
              key={`${result.lat}-${result.lng}`}
              role="option"
              aria-selected={index === activeIndex}
              className={`search-suggestions__item${index === activeIndex ? ' search-suggestions__item--active' : ''}`}
              onMouseDown={() => handleSelect(result)}
              onMouseEnter={() => setActiveIndex(index)}
            >
              {result.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default LocationSearch;
