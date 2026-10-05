"use client";

import { useEffect, useState } from "react";

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

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      setResults([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(trimmed)}`);
        const items = (await res.json()) as SearchItem[];
        setResults(items);
      } catch (error) {
        console.error("Search failed", error);
        setResults([]);
      }
    }, 200);

    return () => window.clearTimeout(timer);
  }, [query]);

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
        <div className="search-wrap">
          <input
            id="search-input"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search an item, e.g. Muramasa, Iron Anvil, Zenith..."
            autoComplete="off"
          />

          {results.length > 0 && query.trim() && (
            <div id="search-results" className="search-results">
              {results.map((item) => (
                <div
                  key={item.name}
                  className="search-result-item"
                  onClick={() => {
                    setQuery(item.name);
                    setResults([]);
                    void loadItem(item.name);
                  }}
                >
                  {imageTag(item.name, item.image, "search-item-img")}
                  <span>{item.name}</span>
                  {item.type ? <span className="type">{item.type}</span> : null}
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
            <div className="item-header">
              {imageTag(selectedItem.name, selectedItem.image, "item-header-img")}
              <div>
                <h3>{selectedItem.name}</h3>
                <div className="item-meta">
                  {[selectedItem.type, selectedItem.rarity ? `Rarity: ${selectedItem.rarity}` : null, selectedItem.sell_value ? `Sell: ${selectedItem.sell_value}` : null].filter(Boolean).join(" • ") || "No extra stats on file"}
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
        )}
      </main>

      <footer>
        <p>
          Data sourced from the <a href="https://terraria.wiki.gg" target="_blank" rel="noopener noreferrer">Official Terraria Wiki</a> (CC BY-NC-SA 4.0). Not affiliated with Re-Logic.
        </p>
      </footer>
    </>
  );
}
