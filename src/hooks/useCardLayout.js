import { useState, useEffect } from "react";

export function useCardLayout(pageKey, defaultCards) {
  const storageKey = `card_layout_${pageKey}`;

  const [cards, setCards] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey));
      if (saved && Array.isArray(saved)) {
        // Merge saved with defaults to handle new cards added later
        const savedIds = new Set(saved.map(c => c.id));
        const newDefaults = defaultCards.filter(d => !savedIds.has(d.id));
        return [...saved, ...newDefaults];
      }
    } catch {}
    return defaultCards;
  });

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify(cards));
  }, [cards, storageKey]);

  const visibleCards = cards.filter(c => c.visible !== false);

  return { cards, setCards, visibleCards };
}