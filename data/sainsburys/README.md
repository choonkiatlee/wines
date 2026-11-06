# Sainsbury's wines — partial catalogue, 6 November 2026

The saved snapshot is [`wines-2026-11-06.json`](wines-2026-11-06.json). This is **not** a complete inventory or a verified set of current offers. It combines names observed in Sainsbury's public Wine category page and indexed category/product pages during October–November 2026. It is intentionally kept separate from Vivino output.

Browse offline, 20 wines per page:

```sh
node scripts/page-sainsburys-catalog.mjs --page 1
node scripts/page-sainsburys-catalog.mjs --page 2 --type red
node scripts/page-sainsburys-catalog.mjs --type white --search sauvignon --json
```

**Data model:** `products[].name` is the source-style product title (including pack size), `type` is inferred from the title, `volumeMl` is parsed from the title, and `provenance` is one of `category_page`, `indexed_category`, `product_page`. The category-level source URL is stored in the parent object. We do **not** invent retailer SKUs, EANs, product URLs, vintages, prices, or in-stock status.

**Access test:** [GitHub Actions run](https://github.com/choonkiatlee/wines/actions/runs/42299803391) received HTTP 403 for six direct public retailer URL variants (category HTML, page 2, product keyword/category API). An external browser-verified or authorised catalogue provider will be required for an exhaustive, reproducible snapshot from this environment. The documented product API supports `page_number` and `page_size` and the third-party category API supports `category_id` plus `page`; neither was proven accessible in this environment. Don't add guessed pagination data or claim the snapshot is exhaustive.

**Future flow:** capture full retailer listings → dedupe by genuine retailer product ID → store unchanged names/pack information → separately normalize search terms → enrich with `enrichWines` in selected page-sized batches → verify candidate identity before displaying Vivino ratings. Keep retailer ratings and promotions distinct from Vivino scores.
