// Filters on the /tags/ page: search by tag or page title, Blog / Docs / Projects, and a tag cloud to pick one tag.
// Works on the lists the tags plugin renders (h2 > .md-tag followed by ul). State is kept in the URL (?tag=pytest&type=docs&q=fixtures).
siteFeed.onPage(() => {
  const content = document.querySelector(".md-content__inner")
  const headings = content ? [...content.querySelectorAll(":scope > h2")].filter(h2 => h2.querySelector(".md-tag")) : []
  if (!headings.length || content.dataset.tagsFilter) return
  content.dataset.tagsFilter = "1"

  const groups = headings.map(h2 => {
    const list = h2.nextElementSibling?.tagName === "UL" ? h2.nextElementSibling : null
    const tag = h2.querySelector(".md-tag").textContent.trim()
    const count = siteFeed.el("span", "archive-count")
    h2.append(count)
    const rows = list
      ? [...list.children].map(li => {
          const a = li.querySelector("a")
          return {
            li,
            title: (a?.textContent ?? "").trim().toLowerCase(),
            type: a?.href.includes("/blog/") ? "blog" : a?.href.includes("/projects/") ? "projects" : "docs",
          }
        })
      : []
    return { h2, list, tag, count, rows }
  })
  const total = new Set(groups.flatMap(g => g.rows.map(r => r.li.querySelector("a")?.href))).size

  // ---------- State ----------
  const params = new URLSearchParams(location.search)
  const state = {
    q: params.get("q") ?? "",
    type: ["blog", "docs", "projects"].includes(params.get("type")) ? params.get("type") : "all",
    tag: groups.some(g => g.tag === params.get("tag")) ? params.get("tag") : "",
  }

  // ---------- Toolbar (same look as the archive filters) ----------
  const bar = siteFeed.el("div", "archive-filters tags-filters")
  const search = siteFeed.el("input", "archive-search")
  Object.assign(search, { type: "search", placeholder: "Filter by tag or page title", value: state.q })
  search.setAttribute("aria-label", "Filter by tag or page title")

  const typeGroup = siteFeed.el("div", "archive-seg")
  typeGroup.setAttribute("role", "group")
  typeGroup.setAttribute("aria-label", "Type")
  const typeButtons = [
    ["all", "All"],
    ["blog", "Blog"],
    ["docs", "Docs"],
    ["projects", "Projects"],
  ].map(([type, label]) => {
    const b = siteFeed.el("button", "", label)
    b.type = "button"
    b.dataset.type = type
    typeGroup.append(b)
    return b
  })

  // Tag cloud, most used first; only the top ones until «Show all»
  const TOP = 24
  const cloud = siteFeed.el("div", "archive-years tags-cloud")
  const chips = [...groups]
    .sort((a, b) => b.rows.length - a.rows.length || a.tag.localeCompare(b.tag))
    .map((g, i) => {
      const b = siteFeed.el("button", "archive-chip", g.tag)
      b.type = "button"
      b.dataset.tag = g.tag
      b.append(siteFeed.el("span", "tags-cloud__n", String(g.rows.length)))
      if (i >= TOP) b.classList.add("tags-cloud__extra")
      cloud.append(b)
      return b
    })
  const more = siteFeed.el("button", "archive-reset tags-cloud__more", `Show all ${groups.length}`)
  more.type = "button"
  if (groups.length > TOP) cloud.append(more)

  const reset = siteFeed.el("button", "archive-reset", "Reset")
  reset.type = "button"

  const row1 = siteFeed.el("div", "archive-filters__row")
  row1.append(search, typeGroup)
  const row2 = siteFeed.el("div", "archive-filters__row")
  row2.append(cloud, reset)
  bar.append(row1, row2)

  const status = siteFeed.el("p", "archive-status")
  status.setAttribute("aria-live", "polite")
  const empty = siteFeed.el("p", "archive-empty", "Nothing found for these filters.")
  headings[0].before(bar, status, empty)

  // ---------- Apply ----------
  const apply = () => {
    const q = state.q.trim().toLowerCase()
    let tagsShown = 0
    const pages = new Set()
    for (const g of groups) {
      const tagOk = !state.tag || g.tag === state.tag
      const tagMatches = q && g.tag.toLowerCase().includes(q)
      let n = 0
      for (const r of g.rows) {
        const ok = tagOk && (state.type === "all" || r.type === state.type) && (!q || tagMatches || r.title.includes(q))
        r.li.hidden = !ok
        if (ok) {
          n += 1
          pages.add(r.li.querySelector("a")?.href)
        }
      }
      g.h2.hidden = n === 0
      if (g.list) g.list.hidden = n === 0
      g.count.textContent = String(n)
      if (n) tagsShown += 1
    }

    const active = q || state.type !== "all" || state.tag
    status.textContent = active
      ? `${tagsShown} of ${groups.length} tags · ${pages.size} of ${total} pages`
      : `${groups.length} tags · ${total} pages`
    empty.hidden = tagsShown > 0
    reset.hidden = !active
    for (const b of typeButtons) b.setAttribute("aria-pressed", String(b.dataset.type === state.type))
    for (const b of chips) b.setAttribute("aria-pressed", String(b.dataset.tag === state.tag))

    const url = new URL(location.href)
    for (const key of ["tag", "type", "q"]) url.searchParams.delete(key)
    if (state.tag) url.searchParams.set("tag", state.tag)
    if (state.type !== "all") url.searchParams.set("type", state.type)
    if (state.q) url.searchParams.set("q", state.q)
    history.replaceState(history.state, "", url)
  }

  // ---------- Events ----------
  search.addEventListener("input", () => {
    state.q = search.value
    apply()
  })
  typeGroup.addEventListener("click", e => {
    const b = e.target.closest("button")
    if (b) {
      state.type = b.dataset.type
      apply()
    }
  })
  cloud.addEventListener("click", e => {
    const b = e.target.closest("button")
    if (!b) return
    if (b === more) {
      cloud.classList.toggle("tags-cloud--all")
      more.textContent = cloud.classList.contains("tags-cloud--all") ? "Show less" : `Show all ${groups.length}`
      return
    }
    state.tag = state.tag === b.dataset.tag ? "" : b.dataset.tag
    apply()
  })
  reset.addEventListener("click", () => {
    Object.assign(state, { q: "", type: "all", tag: "" })
    search.value = ""
    apply()
  })

  // A selected tag outside the top ones: open the full cloud
  if (state.tag && chips.find(b => b.dataset.tag === state.tag)?.classList.contains("tags-cloud__extra")) {
    cloud.classList.add("tags-cloud--all")
    more.textContent = "Show less"
  }
  apply()
})
