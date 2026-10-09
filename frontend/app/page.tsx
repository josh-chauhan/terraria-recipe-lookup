"use client";

import { useEffect, useRef, useState } from "react";

type SearchItem = {
  name: string;
  type?: string;
  image: string;
};

type Ingredient = {
  name: string;
  amount?: number;
  image: string;
};

type Recipe = {
  station: string;
  result_amount: number;
  ingredients: Ingredient[];
};

type ItemDetail = {
  name: string;
  type?: string;
  rarity?: string;
  sell_value?: string;
  research?: number;
  image: string;
  recipes: Recipe[];
  used_in: SearchItem[];
};

type TreeNode = {
  name: string;
  image: string;
  amount?: number;
  base_material?: boolean;
  circular?: boolean;
  truncated?: boolean;
  recipes?: Array<{
    station: string;
    result_amount: number;
    ingredients: TreeNode[];
  }>;
};

const TYPE_LABELS: Record<string, string> = {
  accessory: "Accessory",
  ammunition: "Ammunition",
  armor: "Armor",
  bait: "Bait",
  "background object": "Background Object",
  bar: "Bar",
  block: "Block",
  boots: "Boots",
  brick: "Brick",
  "boss summon": "Boss Summon",
  consumable: "Consumable",
  crate: "Crate",
  "crafting material": "Crafting Material",
  "crafting station": "Crafting Station",
  dye: "Dye",
  "event summon": "Event Summon",
  food: "Food",
  furniture: "Furniture",
  "grab bag": "Grab Bag",
  "hair dye": "Hair Dye",
  key: "Key",
  "light pet": "Light Pet",
  "light source": "Light Source",
  mechanism: "Mechanism",
  miscellaneous: "Miscellaneous",
  "mount summon": "Mount Summon",
  "item summon": "Item Summon",
  ore: "Ore",
  "permanent booster": "Permanent Booster",
  "pet summon": "Pet Summon",
  potion: "Potion",
  seeds: "Seeds",
  set: "Set",
  shield: "Shield",
  storage: "Storage",
  tool: "Tool",
  vanity: "Vanity",
  wall: "Wall",
  weapon: "Weapon",
};

const TYPE_COMBINATIONS: Record<string, string> = {
  "armor^set": "Armor Set",
  "vanity^set": "Vanity Set",
};

const RARITY_LABELS: Record<string, string> = {
  "0": "White",
  "1": "Blue",
  "2": "Green",
  "3": "Orange",
  "4": "Light Red",
  "5": "Pink",
  "6": "Light Purple",
  "7": "Lime",
  "8": "Yellow",
  "9": "Cyan",
  "10": "Red",
  "11": "Purple",
  "12": "Royal Blue",
  "13": "Teal/Purple",
  "14": "Ethereal",
  "15": "Black",
};

const RARITY_COLORS: Record<string, string> = {
  "-13": "#b8b8b8",
  "-12": "#ff69b4",
  "-1": "#b8b8b8",
  "0": "#ffffff",
  "1": "#9696ff",
  "2": "#96ff96",
  "3": "#ffc896",
  "4": "#ff9696",
  "5": "#ff96ff",
  "6": "#c07aff",
  "7": "#96ff00",
  "8": "#ffff00",
  "9": "#00e5ff",
  "10": "#ff4d4d",
  "11": "#ff00ff",
  "12": "#4169ff",
  "13": "#40d6bd",
  "14": "#d36bff",
  "15": "#ffffff",
};

function displayMappedValue(value: string, labels: Record<string, string>) {
  return labels[value.trim().toLowerCase()] ?? value;
}

function rarityTier(value: string) {
  const sortValue = value.match(/data-sort-value=["'](\d+)["']/i)?.[1];
  if (sortValue) {
    return String(Number(sortValue));
  }

  const rarityLevel = value.match(/rarity level:\s*(-?\d+)/i)?.[1];
  if (rarityLevel) {
    return rarityLevel;
  }

  const trimmedValue = value.trim();
  return /^-?\d+$/.test(trimmedValue) ? trimmedValue : undefined;
}

function displayType(value: string) {
  const normalized = value.trim().toLowerCase();
  if (TYPE_COMBINATIONS[normalized]) {
    return TYPE_COMBINATIONS[normalized];
  }

  return normalized
    .split("^")
    .map((part) => TYPE_LABELS[part.trim()] ?? part.trim())
    .join(", ");
}

function imageTag(name: string, image: string, className = "") {
  return <img src={image} alt={name} className={className} onError={(e) => {
    const target = e.currentTarget;
    const src = target.getAttribute("src") || "";
    if (src.endsWith(".png") && !target.dataset.triedGif) {
      target.dataset.triedGif = "1";
      target.src = src.slice(0, -4) + ".gif";
      return;
    }
    target.style.visibility = "hidden";
  }} />;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<ItemDetail | null>(null);
  const [tree, setTree] = useState<TreeNode | null>(null);
  const [loadingItem, setLoadingItem] = useState(false);
  const [loadingTree, setLoadingTree] = useState(false);
  const suppressSearchRef = useRef(false);
  const searchAbortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      return;
    }

    if (suppressSearchRef.current) {
      suppressSearchRef.current = false;
      return;
    }

    searchAbortControllerRef.current?.abort();
    const controller = new AbortController();
    searchAbortControllerRef.current = controller;

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`, {
          signal: controller.signal,
        });
        const items = (await res.json()) as SearchItem[];
        if (!controller.signal.aborted) {
          setResults(items);
        }
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") {
          return;
        }
        console.error("Search failed", error);
        setResults([]);
      }
    }, 200);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [query]);

  const selectSearchItem = (name: string) => {
    suppressSearchRef.current = true;
    setQuery(name);
    setResults([]);
    void loadItem(name);
  };

  const loadItem = async (name: string) => {
    setLoadingItem(true);
    try {
      const res = await fetch(`/api/item/${encodeURIComponent(name)}`);
      if (!res.ok) {
        setSelectedItem(null);
        return;
      }
      const item = (await res.json()) as ItemDetail;
      setSelectedItem(item);
      await loadTree(name);
    } catch (error) {
      console.error(error);
      setSelectedItem(null);
    } finally {
      setLoadingItem(false);
    }
  };

  const loadTree = async (name: string) => {
    setLoadingTree(true);
    try {
      const res = await fetch(`/api/tree/${encodeURIComponent(name)}`);
      const nextTree = (await res.json()) as TreeNode;
      setTree(nextTree);
    } catch (error) {
      console.error(error);
      setTree(null);
    } finally {
      setLoadingTree(false);
    }
  };

  const renderTreeNode = (node: TreeNode, isRoot = false) => {
    if (node.base_material || (!node.recipes && !node.circular && !node.truncated)) {
      return (
        <div className="tree-node-leaf ingredient-row" key={`${node.name}-${node.amount ?? "leaf"}`}>
          {imageTag(node.name, node.image, "tree-item-icon")}
          <span>{node.name}</span>
          <span className="tree-base">base material</span>
        </div>
      );
    }

    if (node.circular || node.truncated) {
      return (
        <div className="ingredient-row" key={`${node.name}-${node.amount ?? "mark"}`}>
          {imageTag(node.name, node.image, "tree-item-icon")}
          <span>{node.name}</span>
          <span className="tree-base">{node.circular ? "(already shown above)" : "(tree truncated)"}</span>
        </div>
      );
    }

    const details = (
      <details className="tree-node" key={`${node.name}-details`} open={isRoot}>
        <summary>
          {imageTag(node.name, node.image, "tree-item-icon")}
          <span>{node.name}</span>
        </summary>
        {node.recipes?.map((recipe, index) => (
          <div key={`${node.name}-recipe-${index}`}>
            <div className="tree-station">
              {node.recipes && node.recipes.length > 1 ? `Option ${index + 1} — at ${recipe.station}` : `at ${recipe.station}`}
            </div>
            {recipe.ingredients.map((ingredient) => renderTreeNode(ingredient, false))}
          </div>
        ))}
      </details>
    );

    return details;
  };

  return (
    <>
      <header className="site-header">
        <h1>⛏️ Terraria Recipe Lookup</h1>
        <p className="subtitle">Search any item to see how to craft it, what it&apos;s used in, and its full ingredient tree.</p>
      </header>

      <main>
        <aside className="jungle-tree-sidebar">
          <img
            src="/JungleTreeTerra.png"
            alt="Rich Mahogany tree"
            className="sidebar-sprite"
          />
          <img
            src="/old-man-sprite.webp"
            alt="Terraria Old Man"
            className="sidebar-sprite"
          />
        </aside>

        <aside className="right-sidebar" aria-label="World sprites">
          <img
            src="/merchant-sprite.png"
            alt="Terraria Merchant"
            className="sidebar-sprite merchant-sprite"
          />
          <img
            src="/hallow-tree.webp"
            alt="Hallow Tree"
            className="sidebar-sprite hallow-tree-sprite"
          />
        </aside>

        <div className="page-content">
          <div className="search-wrap">
            <input
              id="search-input"
              type="text"
              value={query}
              onChange={(event) => {
                const nextQuery = event.target.value;
                setQuery(nextQuery);
                if (!nextQuery.trim()) {
                  setResults([]);
                }
              }}
              placeholder="Search an item, e.g. Muramasa, Iron Anvil, Zenith..."
              autoComplete="off"
            />

            {results.length > 0 && query.trim() && (
              <div id="search-results" className="search-results">
                {results.map((item) => (
                  <div
                    key={item.name}
                    className="search-result-item"
                    onClick={() => selectSearchItem(item.name)}
                  >
                    {imageTag(item.name, item.image, "search-item-img")}
                    <span>{item.name}</span>
                    {item.type ? <span className="type">{displayType(item.type)}</span> : null}
                  </div>
                ))}
              </div>
            )}
          </div>

          {!selectedItem && !loadingItem && (
            <div className="empty-state">
              <p>Start typing above to look up an item.</p>
            </div>
          )}

          {selectedItem && (
            <div className="item-panel">
            <div className="item-content">
              <div className="item-header">
                {imageTag(selectedItem.name, selectedItem.image, "item-header-img")}
                <div>
                  <h3>{selectedItem.name}</h3>
                  <div className="item-meta">
                    {selectedItem.type && (
                      <span className="item-meta-chip">
                        <strong>Type:</strong> {displayType(selectedItem.type)}
                      </span>
                    )}
                    {selectedItem.rarity && (
                      <span className="item-meta-chip">
                        <strong>Rarity:</strong>{" "}
                        <span
                          className="rarity-value"
                          style={{ color: RARITY_COLORS[rarityTier(selectedItem.rarity) ?? ""] }}
                        >
                          {displayMappedValue(selectedItem.rarity, RARITY_LABELS)}
                        </span>
                      </span>
                    )}
                    {selectedItem.sell_value && (
                      <span className="item-meta-chip">
                        <strong>Sell:</strong> {selectedItem.sell_value}
                      </span>
                    )}
                    {!selectedItem.type && !selectedItem.rarity && !selectedItem.sell_value && (
                      <span>No extra stats on file</span>
                    )}
                  </div>
                </div>
              </div>

              <section>
                <h2>Crafting Recipe</h2>
                {selectedItem.recipes.length === 0 ? (
                  <p className="muted">This item has no known crafting recipe (it may be found, dropped, bought, or otherwise obtained instead).</p>
                ) : (
                  selectedItem.recipes.map((recipe, index) => (
                    <div className="recipe-card" key={`${selectedItem.name}-recipe-${index}`}>
                      <div className="recipe-station">
                        Crafted at: {recipe.station}{recipe.result_amount > 1 ? ` (yields ${recipe.result_amount})` : ""}
                      </div>
                      {recipe.ingredients.map((ingredient) => (
                        <div className="ingredient-row" key={`${ingredient.name}-${ingredient.amount ?? "mat"}`}>
                          {imageTag(ingredient.name, ingredient.image, "ingredient-icon")}
                          <span className="amount">{ingredient.amount}x</span>
                          <a href="#" onClick={(event) => { event.preventDefault(); setQuery(ingredient.name); void loadItem(ingredient.name); }}>
                            {ingredient.name}
                          </a>
                        </div>
                      ))}
                    </div>
                  ))
                )}
              </section>

              <section>
                <h2>Used In</h2>
                {selectedItem.used_in.length === 0 ? (
                  <p className="muted">Not used as an ingredient in any known recipe.</p>
                ) : (
                  <div className="used-in-grid">
                    {selectedItem.used_in.map((item) => (
                      <div className="used-in-chip" key={item.name} onClick={() => { setQuery(item.name); void loadItem(item.name); }}>
                        {imageTag(item.name, item.image, "used-item-icon")}
                        <span>{item.name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </section>

              <section>
                <h2>Full Ingredient Tree</h2>
                <p className="hint">Expand to see raw materials needed all the way down.</p>
                {loadingTree ? (
                  <p className="muted">Loading tree...</p>
                ) : tree ? (
                  renderTreeNode(tree, true)
                ) : (
                  <p className="muted">Could not load the crafting tree.</p>
                )}
              </section>
            </div>
          </div>
          )}
        </div>
      </main>

      <footer>
        <p>
          Data sourced from the <a href="https://terraria.wiki.gg" target="_blank" rel="noopener noreferrer">Official Terraria Wiki</a> (CC BY-NC-SA 4.0). Not affiliated with Re-Logic.
        </p>
        <a
          className="footer-github"
          href="https://github.com/josh-chauhan"
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Visit Josh Chauhan on GitHub"
          title="GitHub profile"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path fill="currentColor" d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.084 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.605-2.665-.3-5.466-1.334-5.466-5.93 0-1.31.467-2.38 1.235-3.22-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 6.006 0c2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.873.12 3.176.77.84 1.233 1.91 1.233 3.22 0 4.61-2.805 5.625-5.475 5.92.43.37.823 1.102.823 2.222 0 1.604-.015 2.896-.015 3.29 0 .322.216.694.825.576A12.005 12.005 0 0 0 24 12.297c0-6.627-5.373-12-12-12z"/>
          </svg>
          <span>@josh-chauhan</span>
        </a>
      </footer>
    </>
  );
}
