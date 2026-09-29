// The /archive/ page: blog posts, Docs articles and projects grouped by month, newest first,
// with filters by date range (months), year, type (Blog / Docs / Projects), tag and title.
// Posts and articles come from the site feed; projects from #archive-projects (main.html, from zensical.toml).
// Filters are kept in the URL (?from=2026-01&to=2026-09&type=docs&tag=pytest&q=fixtures), so a filtered view can be shared.
siteFeed.onPage(async () => {
  const box = document.querySelector(".archive-all")
  if (!box || box.dataset.loaded) return
  box.dataset.loaded = "1"

  const day = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" })
  const month = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
  const shortMonth = new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" })
  const monthKey = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`

  let items
  try {
    items = await siteFeed.load(box.dataset.feed)
  } catch {
    return // without the feed, the blog link from <noscript> stays
  }
  try {
    const projects = JSON.parse(document.getElementById("archive-projects")?.textContent ?? "[]")
    items = items.concat(
      projects.map(p => ({
        ...p,
        project: true,
        date: new Date(`${p.date}T00:00:00Z`),
        date_published: p.date,
        path: new URL(p.url, location.href).pathname,
      })),
    )
  } catch {
    // without the projects list the archive still shows posts and docs
  }
  const typeOf = item => (item.project ? "projects" : siteFeed.isDocs(item) ? "docs" : "blog")
  const LABELS = { blog: "Blog", docs: "Docs", projects: "Project" }

  const byMonth = new Map()
  for (const item of items) {
    const key = monthKey(item.date)
    if (!byMonth.has(key)) byMonth.set(key, [])
    byMonth.get(key).push(item)
  }

  // Month groups, newest first; each keeps its heading, counter and rows for filtering
  const groups = [...byMonth]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([key, posts]) => {
      const heading = siteFeed.el("h2", "", month.format(posts[0].date))
      heading.id = key
      const count = siteFeed.el("span", "archive-count", String(posts.length))
      heading.append(" ", count)

      const list = siteFeed.el("ul", "archive-list md-typeset")
      const rows = posts
        .sort((a, b) => b.date - a.date)
        .map(post => {
          const type = typeOf(post)
          const kind = siteFeed.el("span", `archive-kind archive-kind--${type}`, LABELS[type])
          const li = siteFeed.el("li")
          li.append(siteFeed.time(post, day), siteFeed.link(post), kind)
          list.append(li)
          return { li, type, title: post.title.toLowerCase(), tags: post.tags ?? [] }
        })
      return { key, date: posts[0].date, heading, count, list, rows }
    })

  const keys = groups.map(g => g.key) // newest first
  const years = [...new Set(keys.map(k => k.slice(0, 4)))]

  // Tags with the number of entries, most used first
  const tagCounts = new Map()
  for (const item of items) for (const tag of item.tags ?? []) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1)
  const tags = [...tagCounts].sort(([a, n], [b, m]) => m - n || a.localeCompare(b))

  // ---------- Filter state (from the URL) ----------
  const params = new URLSearchParams(location.search)
  const state = {
    q: params.get("q") ?? "",
    type: ["blog", "docs", "projects"].includes(params.get("type")) ? params.get("type") : "all",
    from: keys.includes(params.get("from")) ? params.get("from") : "",
    to: keys.includes(params.get("to")) ? params.get("to") : "",
    tag: tagCounts.has(params.get("tag")) ? params.get("tag") : "",
  }

  // ---------- Toolbar ----------
  const bar = siteFeed.el("div", "archive-filters")

  const search = siteFeed.el("input", "archive-search")
  Object.assign(search, { type: "search", placeholder: "Filter by title", value: state.q })
  search.setAttribute("aria-label", "Filter by title")

  const typeGroup = siteFeed.el("div", "archive-seg")
  typeGroup.setAttribute("role", "group")
  typeGroup.setAttribute("aria-label", "Type")
  const typeButtons = ["all", "blog", "docs", "projects"].map(type => {
    const b = siteFeed.el("button", "", { all: "All", blog: "Blog", docs: "Docs", projects: "Projects" }[type])
    b.type = "button"
    b.dataset.type = type
    typeGroup.append(b)
    return b
  })

  const monthSelect = (label, any) => {
    const wrap = siteFeed.el("label", "archive-field")
    wrap.append(siteFeed.el("span", "", label))
    const select = siteFeed.el("select")
    select.append(new Option(any, ""))
    for (const g of groups) select.append(new Option(shortMonth.format(g.date), g.key))
    wrap.append(select)
    return { wrap, select }
  }
  const from = monthSelect("From", "Any month")
  const to = monthSelect("To", "Any month")
  from.select.value = state.from
  to.select.value = state.to

  const tagField = siteFeed.el("label", "archive-field")
  tagField.append(siteFeed.el("span", "", "Tag"))
  const tagSelect = siteFeed.el("select")
  tagSelect.append(new Option("Any tag", ""))
  for (const [tag, n] of tags) tagSelect.append(new Option(`${tag} (${n})`, tag))
  tagSelect.value = state.tag
  tagField.append(tagSelect)

  const yearGroup = siteFeed.el("div", "archive-years")
  const yearButtons = years.map(year => {
    const b = siteFeed.el("button", "archive-chip", year)
    b.type = "button"
    b.dataset.year = year
    yearGroup.append(b)
    return b
  })

  const reset = siteFeed.el("button", "archive-reset", "Reset")
  reset.type = "button"
  const status = siteFeed.el("p", "archive-status")
  status.setAttribute("aria-live", "polite")
  const empty = siteFeed.el("p", "archive-empty", "Nothing found for these filters.")

  const row1 = siteFeed.el("div", "archive-filters__row")
  row1.append(search, typeGroup)
  const row2 = siteFeed.el("div", "archive-filters__row")
  row2.append(from.wrap, to.wrap, tagField, yearGroup, reset)
  bar.append(row1, row2)

  box.append(bar, status, empty)
  for (const g of groups) box.append(g.heading, g.list)

  // First and last month of a year that has entries
  const yearRange = year => {
    const inYear = keys.filter(k => k.startsWith(year))
    return [inYear[inYear.length - 1], inYear[0]]
  }

  // ---------- Apply ----------
  const apply = () => {
    let [lo, hi] = [state.from || keys[keys.length - 1], state.to || keys[0]]
    if (lo > hi) [lo, hi] = [hi, lo]
    const q = state.q.trim().toLowerCase()

    let shown = 0
    for (const g of groups) {
      const inRange = g.key >= lo && g.key <= hi
      let n = 0
      for (const row of g.rows) {
        const ok =
          inRange &&
          (state.type === "all" || row.type === state.type) &&
          (!state.tag || row.tags.includes(state.tag)) &&
          (!q || row.title.includes(q))
        row.li.hidden = !ok
        if (ok) n += 1
      }
      g.heading.hidden = g.list.hidden = n === 0
      g.count.textContent = String(n)
      shown += n
    }

    const active = state.q || state.type !== "all" || state.from || state.to || state.tag
    status.textContent = active ? `${shown} of ${items.length} entries` : `${items.length} entries`
    empty.hidden = shown > 0
    reset.hidden = !active

    for (const b of typeButtons) b.setAttribute("aria-pressed", String(b.dataset.type === state.type))
    for (const b of yearButtons) {
      const [first, last] = yearRange(b.dataset.year)
      b.setAttribute("aria-pressed", String(state.from === first && state.to === last))
    }

    const next = new URLSearchParams()
    if (state.from) next.set("from", state.from)
    if (state.to) next.set("to", state.to)
    if (state.type !== "all") next.set("type", state.type)
    if (state.tag) next.set("tag", state.tag)
    if (state.q) next.set("q", state.q)
    const query = next.toString()
    history.replaceState(history.state, "", `${location.pathname}${query ? `?${query}` : ""}${location.hash}`)
  }

  // ---------- Events ----------
  search.addEventListener("input", () => {
    state.q = search.value
    apply()
  })
  typeGroup.addEventListener("click", e => {
    const b = e.target.closest("button")
    if (!b) return
    state.type = b.dataset.type
    apply()
  })
  from.select.addEventListener("change", () => {
    state.from = from.select.value
    apply()
  })
  to.select.addEventListener("change", () => {
    state.to = to.select.value
    apply()
  })
  tagSelect.addEventListener("change", () => {
    state.tag = tagSelect.value
    apply()
  })
  yearGroup.addEventListener("click", e => {
    const b = e.target.closest("button")
    if (!b) return
    const [first, last] = yearRange(b.dataset.year)
    const same = state.from === first && state.to === last
    state.from = same ? "" : first // a second click on the active year clears it
    state.to = same ? "" : last
    from.select.value = state.from
    to.select.value = state.to
    apply()
  })
  reset.addEventListener("click", () => {
    Object.assign(state, { q: "", type: "all", from: "", to: "", tag: "" })
    search.value = from.select.value = to.select.value = tagSelect.value = ""
    apply()
  })

  apply()
})
