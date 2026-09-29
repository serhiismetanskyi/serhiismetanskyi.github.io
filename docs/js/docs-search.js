// Search on the /docs/ overview: filters topic cards and lists matching articles from the site feed.
// The query is kept in the URL (?q=pytest).
siteFeed.onPage(async () => {
  const box = document.querySelector(".kb-search")
  if (!box || box.dataset.loaded) return
  box.dataset.loaded = "1"

  const content = box.closest(".md-content__inner")
  const sections = [...content.querySelectorAll(".kb-section")].map(section => {
    const link = section.querySelector("h3 a")
    return {
      section,
      text: section.textContent.toLowerCase(),
      title: link?.textContent.trim() ?? "",
      path: link ? new URL(link.href).pathname.replace(/index\.html$/, "") : "",
    }
  })
  // Topic folders for labels «Topic › Section»: card titles plus every section from the sidebar navigation
  const pathOf = a => new URL(a.href, location.href).pathname.replace(/index\.html$/, "")
  const cardOf = path =>
    sections.filter(s => s.path && path.startsWith(s.path)).sort((a, b) => b.path.length - a.path.length)[0]
  const navLinks = [...document.querySelectorAll(".md-nav--primary a.md-nav__link[href]")].map(a => ({
    path: pathOf(a),
    label: a.textContent.trim(),
  }))

  const labelFor = path => {
    const card = cardOf(path)
    if (!card) return ""
    // deepest section folder inside the card that contains the article (not the article itself)
    const section = navLinks
      .filter(l => l.path !== path && l.path.length > card.path.length && path.startsWith(l.path))
      .sort((a, b) => b.path.length - a.path.length)[0]
    return section ? `${card.title} › ${section.label}` : card.title
  }

  // Group headings (Architecture & Design, …), each followed by its .kb-sections grid
  const groups = [...content.querySelectorAll(":scope > h2")]
    .filter(h2 => h2.nextElementSibling?.classList.contains("kb-sections"))
    .map(h2 => ({ h2, grid: h2.nextElementSibling }))

  // ---------- UI ----------
  const field = siteFeed.el("div", "kb-search__field")
  const input = siteFeed.el("input", "kb-search__input")
  Object.assign(input, { type: "search", placeholder: "Search topics and articles", autocomplete: "off" })
  input.setAttribute("aria-label", "Search topics and articles")
  field.append(input)

  const status = siteFeed.el("p", "kb-search__status")
  status.setAttribute("aria-live", "polite")
  const results = siteFeed.el("ul", "kb-results")
  box.append(field, status, results)

  // Articles come from the feed; loaded on the first query
  let articles = null
  const loadArticles = async () => {
    if (articles) return articles
    try {
      const items = await siteFeed.load(box.dataset.feed)
      articles = items.filter(siteFeed.isDocs).map(item => ({
        item,
        title: item.title.toLowerCase(),
        tags: (item.tags ?? []).join(" ").toLowerCase(),
        topic: labelFor(item.path),
      }))
    } catch {
      articles = []
    }
    return articles
  }

  const LIMIT = 12

  let run = 0 // bumps on every query; a slower earlier run must not overwrite a newer one

  const apply = async () => {
    const current = ++run
    const q = input.value.trim().toLowerCase()
    const words = q.split(/\s+/).filter(Boolean)
    const match = text => words.every(w => text.includes(w))

    // Topic cards and groups
    let topics = 0
    for (const s of sections) {
      const ok = !words.length || match(s.text)
      s.section.hidden = !ok
      if (ok) topics += 1
    }
    for (const g of groups) {
      const any = [...g.grid.querySelectorAll(".kb-section")].some(s => !s.hidden)
      g.h2.hidden = g.grid.hidden = !any
    }

    // Articles
    results.replaceChildren()
    if (words.length) {
      const loaded = await loadArticles()
      if (current !== run) return
      const found = loaded.filter(a => match(`${a.title} ${a.tags} ${a.topic.toLowerCase()}`))
      for (const a of found.slice(0, LIMIT)) {
        const li = siteFeed.el("li")
        const link = siteFeed.link(a.item)
        link.textContent = ""
        link.append(siteFeed.el("span", "kb-results__title", a.item.title))
        if (a.topic) link.append(siteFeed.el("span", "kb-results__topic", a.topic))
        li.append(link)
        results.append(li)
      }
      const more = found.length > LIMIT ? ` (showing ${LIMIT})` : ""
      status.textContent =
        found.length || topics
          ? `${found.length} articles${more} · ${topics} topics`
          : "Nothing found. Try another word or press Ctrl+K for full-text search."
    } else {
      status.textContent = ""
    }
    results.hidden = !results.children.length
    status.hidden = !words.length

    const url = new URL(location.href)
    if (q) url.searchParams.set("q", input.value.trim())
    else url.searchParams.delete("q")
    history.replaceState(history.state, "", url)
  }

  input.addEventListener("input", apply)
  input.addEventListener("keydown", e => {
    if (e.key === "Escape") {
      input.value = ""
      apply()
    }
  })

  input.value = new URLSearchParams(location.search).get("q") ?? ""
  apply()
})
