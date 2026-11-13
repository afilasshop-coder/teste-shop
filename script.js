/*
 * Add one entry for each product catalog with its published Sheet CSV URL.
 * See README.md.
 * The links are kept in config/catalogs.js so they are easier to update.
 */
const CONFIG = {
  catalogs: Array.isArray(window.CATALOGS) ? window.CATALOGS : []
};

const catalogList = document.querySelector("#catalog-list");
const statusMessage = document.querySelector("#status-message");
const searchInput = document.querySelector("#search");
const resultCount = document.querySelector("#result-count");
const paginationElement = document.querySelector("#pagination");
const mobileMenuToggle = document.querySelector("#mobile-menu-toggle");
const mainNav = document.querySelector("#main-nav");
const textRequests = new Map();
const mobileViewport = window.matchMedia("(max-width: 650px)");

let catalogs = [];
let currentPage = 1;

mobileViewport.addEventListener("change", () => {
  currentPage = 1;
  renderCatalogs();
});

document.querySelector("#year").textContent = new Date().getFullYear();
mobileMenuToggle.addEventListener("click", () => {
  const isExpanded = mobileMenuToggle.getAttribute("aria-expanded") === "true";
  mobileMenuToggle.setAttribute("aria-expanded", String(!isExpanded));
  mobileMenuToggle.setAttribute("aria-label", isExpanded ? "Abrir menu" : "Fechar menu");
  mainNav.classList.toggle("is-open", !isExpanded);
});
mainNav.addEventListener("click", (event) => {
  if (!event.target.closest("a")) return;
  mobileMenuToggle.setAttribute("aria-expanded", "false");
  mobileMenuToggle.setAttribute("aria-label", "Abrir menu");
  mainNav.classList.remove("is-open");
});
searchInput.addEventListener("input", () => {
  currentPage = 1;
  renderCatalogs();
});
paginationElement.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-page]");
  if (!button || button.disabled) return;

  currentPage = Number(button.dataset.page);
  renderCatalogs();
});
loadCatalogs();

async function loadCatalogs() {
  if (!Array.isArray(CONFIG.catalogs) || CONFIG.catalogs.length === 0) {
    catalogList.setAttribute("aria-busy", "false");
    return;
  }

  catalogs = CONFIG.catalogs.map((config, index) => {
    const catalog = {
      name: config.name?.trim() || `Catálogo ${index + 1}`,
      products: [],
      error: ""
    };
    createCatalogSection(catalog, index);
    return catalog;
  });

  await Promise.all(catalogs.map(async (catalog, index) => {
    const config = CONFIG.catalogs[index];
    const sourceUrl = normalizeGoogleSheetCsvUrl(config.sheetCsvUrl);
    if (!Array.isArray(config.products) && !isConfigured(sourceUrl)) {
      return;
    }

    try {
      let catalogProducts;

      if (Array.isArray(config.products)) {
        catalogProducts = normalizeConfiguredProducts(config.products);
      } else {
        catalogProducts = parseProducts(await fetchTextOnce(sourceUrl, "A Planilha"));
      }

      catalog.products = catalogProducts;
      statusMessage.hidden = true;
      renderCatalogs();
    } catch (error) {
      console.error(`Não foi possível carregar ${catalog.name}:`, error);
      catalog.error = `${error.message} Verifique os dados e os links do catálogo.`;
    }
  }));

  renderCatalogs();
  catalogList.setAttribute("aria-busy", "false");
}

function fetchTextOnce(url, sourceName) {
  if (!textRequests.has(url)) {
    const request = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`${sourceName} respondeu com erro HTTP ${response.status}.`);
        return response.text();
      })
      .catch((error) => {
        textRequests.delete(url);
        throw error;
      });
    textRequests.set(url, request);
  }
  return textRequests.get(url);
}

function normalizeConfiguredProducts(items) {
  return items
    .filter((product) => product && typeof product === "object")
    .map((product) => ({
      name: String(product.name ?? "").trim(),
      description: String(product.description ?? "").trim(),
      price: String(product.price ?? "").trim(),
      category: String(product.category ?? "").trim(),
      link: String(product.link ?? "").trim(),
      image: String(product.image ?? "").trim()
    }))
    .filter((product) => product.name);
}

function normalizeGoogleSheetCsvUrl(url) {
  if (!url) return url;
  const match = url.match(/docs\.google\.com\/spreadsheets\/d\/([^/]+)/i);
  if (!match) return url;
  if (url.includes('/export')) return url;
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=0`;
}

function isConfigured(url) {
  return typeof url === "string" && /^https?:\/\//.test(url) && !url.startsWith("https://COLE_AQUI_");
}

function createCatalogSection(catalog, index) {
  const section = document.createElement("section");
  section.className = "catalog-group";
  section.setAttribute("aria-labelledby", `catalog-title-${index}`);

  const heading = document.createElement("div");
  heading.className = "catalog-group-heading";

  const title = document.createElement("h3");
  title.className = "catalog-title";
  title.classList.add("visually-hidden");
  title.id = `catalog-title-${index}`;
  title.textContent = catalog.name;

  const count = document.createElement("span");
  count.className = "catalog-count";
  count.classList.add("visually-hidden");

  const grid = document.createElement("div");
  grid.className = "product-grid";

  const message = document.createElement("div");
  message.className = "status-message catalog-status";
  message.setAttribute("role", "status");
  message.hidden = true;

  heading.append(title, count);
  section.append(heading, grid, message);
  catalogList.append(section);
  Object.assign(catalog, { element: section, countElement: count, gridElement: grid, messageElement: message });
}

function parseProducts(csvText) {
  const rows = parseCsv(csvText).filter((row) => row.some((cell) => cell.trim() !== ""));
  if (rows.length === 0) return [];

  const headerRowIndex = rows.findIndex((row) => {
    const candidateHeaders = row.map(normalizeText);
    return findColumn(candidateHeaders, ["nome do produto", "produto", "nome"]) >= 0;
  });
  const columns = headerRowIndex < 0
    ? { name: 0, description: 1, price: 2, category: -1, image: 3, link: 4 }
    : (() => {
      const headers = rows[headerRowIndex].map(normalizeText);
      const mappedColumns = {
        name: findColumn(headers, ["nome do produto", "produto", "nome"]),
        description: findColumn(headers, ["descrição/texto", "descricao/texto", "descrição", "descricao", "texto"]),
        price: findColumn(headers, ["preço", "preco", "valor"]),
        category: findColumn(headers, ["categoria"]),
        link: findColumn(headers, ["link", "link do produto", "link para comprar", "link de compra", "link de pagamento/whatsapp", "link de pagamento", "whatsapp"]),
        image: findColumn(headers, ["link de imagem", "link da imagem", "imagem", "imagem url", "foto", "foto url", "image", "image url"])
      };
      const required = Object.entries(mappedColumns).filter(([name, index]) => !["image", "category"].includes(name) && index < 0);
      if (required.length > 0) {
        throw new Error(`Não encontrei estas colunas no cabeçalho da Planilha: ${required.map(([name]) => name).join(", ")}.`);
      }
      return mappedColumns;
    })();
  const productRows = headerRowIndex < 0 ? rows : rows.slice(headerRowIndex + 1);

  return productRows.map((row) => ({
    name: cellAt(row, columns.name),
    description: cellAt(row, columns.description),
    price: cellAt(row, columns.price),
    category: columns.category < 0 ? "" : cellAt(row, columns.category),
    link: cellAt(row, columns.link),
    image: columns.image < 0 ? "" : cellAt(row, columns.image)
  })).filter((product) => product.name && !/^https?:\/\/affiliate\.shopee\.com\.br\/api\/v1\/datafeed\/download(?:\?|$)/i.test(product.name));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let insideQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];
    if (character === '"') {
      if (insideQuotes && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        insideQuotes = !insideQuotes;
      }
    } else if (character === "," && !insideQuotes) {
      row.push(cell);
      cell = "";
    } else if ((character === "\n" || character === "\r") && !insideQuotes) {
      if (character === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  if (cell || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function findColumn(headers, acceptedNames) {
  return headers.findIndex((header) => acceptedNames.includes(header));
}

function cellAt(row, index) {
  return (row[index] || "").trim();
}

function normalizeText(value) {
  return value
    .replace(/^\uFEFF/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function renderCatalogs() {
  const pageSize = mobileViewport.matches ? 10 : 12;
  const query = normalizeText(searchInput.value);
  const matchingCatalogs = catalogs.map((catalog) => ({
    catalog,
    products: catalog.products.filter((product) => {
      return !query || normalizeText(`${product.name} ${product.description} ${product.category}`).includes(query);
    })
  }));
  const matchingProducts = matchingCatalogs.flatMap(({ catalog, products: catalogProducts }) =>
    catalogProducts.map((product) => ({ catalog, product }))
  );
  const totalPages = Math.ceil(matchingProducts.length / pageSize);
  currentPage = Math.min(currentPage, Math.max(totalPages, 1));
  const startIndex = (currentPage - 1) * pageSize;
  const pageProducts = matchingProducts.slice(startIndex, startIndex + pageSize);

  matchingCatalogs.forEach(({ catalog, products: catalogProducts }) => {
    const productsToDisplay = pageProducts
      .filter((entry) => entry.catalog === catalog)
      .map((entry) => entry.product);
    catalog.gridElement.replaceChildren(...productsToDisplay.map(createProductCard));
    catalog.countElement.textContent = `${catalogProducts.length} ${catalogProducts.length === 1 ? "produto" : "produtos"}`;
    catalog.messageElement.textContent = "";
    catalog.messageElement.hidden = true;
    catalog.element.hidden = productsToDisplay.length === 0;
  });

  const visibleCount = matchingProducts.length;
  const displayedEnd = Math.min(startIndex + pageSize, visibleCount);
  resultCount.textContent = visibleCount === 0
    ? "0 produtos"
    : `Mostrando ${startIndex + 1}-${displayedEnd} de ${visibleCount} produtos`;
  renderPagination(totalPages);
}

function renderPagination(totalPages) {
  paginationElement.replaceChildren();
  paginationElement.hidden = totalPages <= 1;
  if (paginationElement.hidden) return;

  paginationElement.append(createPageButton("Anterior", currentPage - 1, currentPage === 1));

  const pageNumbers = [...new Set([1, currentPage - 1, currentPage, currentPage + 1, totalPages])]
    .filter((page) => page > 0 && page <= totalPages)
    .sort((first, second) => first - second);
  let previousPage = 0;

  pageNumbers.forEach((page) => {
    if (previousPage && page - previousPage > 1) {
      const ellipsis = document.createElement("span");
      ellipsis.className = "pagination-ellipsis";
      ellipsis.textContent = "...";
      paginationElement.append(ellipsis);
    }
    paginationElement.append(createPageButton(String(page), page, false, page === currentPage));
    previousPage = page;
  });

  paginationElement.append(createPageButton("Próxima", currentPage + 1, currentPage === totalPages));
}

function createPageButton(label, page, disabled, isCurrent = false) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "pagination-button";
  button.textContent = label;
  button.dataset.page = String(page);
  button.disabled = disabled;
  if (isCurrent) button.setAttribute("aria-current", "page");
  return button;
}

function createProductCard(product) {
  const card = document.createElement("article");
  card.className = "product-card";

  const imageWrap = document.createElement("div");
  imageWrap.className = "product-image-wrap";
  const imageLink = document.createElement("a");
  imageLink.className = "product-image-link";
  setProductDestination(imageLink, product);
  imageLink.setAttribute("aria-label", `Abrir página de ${product.name}`);
  if (product.image) {
    const image = document.createElement("img");
    image.className = "product-image";
    image.src = product.image;
    image.alt = product.name;
    image.loading = "lazy";
    image.addEventListener("error", () => {
      image.replaceWith(createImagePlaceholder());
    }, { once: true });
    imageLink.append(image);
  } else {
    imageLink.append(createImagePlaceholder());
  }
  imageWrap.append(imageLink);

  const info = document.createElement("div");
  info.className = "product-info";

  const name = document.createElement("h3");
  name.className = "product-name";
  const nameLink = document.createElement("a");
  setProductDestination(nameLink, product);
  nameLink.textContent = product.name;
  name.append(nameLink);

  const description = document.createElement("p");
  description.className = "product-description";
  description.textContent = product.description;

  const category = document.createElement("p");
  category.className = "product-category";
  category.textContent = product.category;
  category.hidden = !product.category;

  const bottom = document.createElement("div");
  bottom.className = "product-bottom";

  const price = document.createElement("span");
  price.className = "product-price";
  price.textContent = formatPrice(product.price);

  const detailLink = createBuyLink(product, "Ver mais", false);

  bottom.append(price, detailLink);
  info.append(name, category, description, bottom);
  card.append(imageWrap, info);
  return card;
}

function createBuyLink(product, label = "Comprar ↗", openInNewTab = true) {
  const buyLink = document.createElement("a");
  buyLink.className = "buy-button";
  buyLink.textContent = label;
  if (isSafeWebUrl(product.link)) {
    buyLink.href = product.link;
    if (openInNewTab) {
      buyLink.target = "_blank";
      buyLink.rel = "noopener noreferrer";
    }
  } else {
    buyLink.href = "#";
    buyLink.setAttribute("aria-disabled", "true");
    buyLink.addEventListener("click", (event) => event.preventDefault());
    buyLink.title = "Adicione um link válido na coluna E da Planilha.";
  }
  return buyLink;
}

function setProductDestination(link, product) {
  if (isSafeWebUrl(product.link)) {
    link.href = product.link;
    return;
  }

  link.href = "#";
  link.setAttribute("aria-disabled", "true");
  link.addEventListener("click", (event) => event.preventDefault());
}

function createImagePlaceholder() {
  const placeholder = document.createElement("div");
  placeholder.className = "image-placeholder";
  placeholder.setAttribute("aria-hidden", "true");
  placeholder.textContent = "A";
  return placeholder;
}

function formatPrice(value) {
  const normalized = value.trim().replace(/\s/g, "");
  const numeric = normalized.includes(",")
    ? Number(normalized.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, ""))
    : Number(normalized.replace(/[^\d.-]/g, ""));

  if (!Number.isFinite(numeric)) return value || "Consulte";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(numeric);
}

function isSafeWebUrl(value) {
  if (typeof value !== "string") return false;
  const candidate = value.trim();
  if (!/^https?:\/\//i.test(candidate)) return false;

  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function isSafeImageSource(value) {
  return isSafeWebUrl(value) || /^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/]+=*$/i.test(value);
}

function showMessage(message) {
  statusMessage.textContent = message;
  statusMessage.hidden = !message;
}
