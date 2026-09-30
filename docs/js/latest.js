// «Latest posts» and «Latest docs» cards on the home page (.latest blocks in docs/index.md)
siteFeed.onPage(async () => {
  const boxes = [...document.querySelectorAll(".latest[data-kind]")].filter(box => !box.dataset.loaded)
  if (!boxes.length) return
  for (const box of boxes) box.dataset.loaded = "1"

  let items
  try {
    items = await siteFeed.load()
  } catch {
    return // without the feed the cards just stay hidden
  }

  const format = new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" })
  for (const box of boxes) {
    const limit = Number(box.dataset.limit) || 3
    const entries = box.dataset.kind === "docs" ? docGuides(items) : blogPosts(items)
    const list = box.querySelector("ul")
    for (const entry of entries.slice(0, limit)) list.append(row(entry, format))
    box.hidden = list.children.length === 0
  }
})

// Blog posts, newest first
const blogPosts = items => items.filter(siteFeed.isBlog).map(item => ({ item, date: item.date }))

// Docs articles grouped by guide: one row per guide folder, linked to its index page,
// with the number of articles and the date of the newest one
const docGuides = items => {
  const docs = items.filter(siteFeed.isDocs)
  const paths = new Set(docs.map(d => d.path))
  const isIndex = d => docs.some(o => o !== d && o.path.startsWith(d.path))
  const parent = path => path.replace(/[^/]+\/$/, "")

  const groups = new Map()
  for (const d of docs) {
    const index = isIndex(d)
    const key = index || !paths.has(parent(d.path)) ? d.path : parent(d.path)
    const group = groups.get(key) ?? { articles: 0, date: d.date, index: null, latest: d }
    if (index) group.index = d
    else group.articles += 1
    if (d.date > group.date) group.date = d.date
    groups.set(key, group)
  }

  return [...groups.values()]
    .filter(g => g.articles > 0 || !g.index) // skip topic pages that only group subsections
    .sort((a, b) => b.date - a.date)
    .map(g => ({ item: g.index ?? g.latest, date: g.date, count: g.index ? g.articles : 0 }))
}

// <li><a><span title/><span meta: date · N articles/></a></li>
const row = ({ item, date, count }, format) => {
  const li = siteFeed.el("li")
  const a = siteFeed.link(item)
  a.textContent = ""
  a.append(siteFeed.el("span", "latest__title", item.title))

  const meta = siteFeed.el("span", "latest__meta")
  const time = siteFeed.el("time", "", format.format(date))
  time.dateTime = date.toISOString()
  meta.append(time)
  if (count > 1) meta.append(siteFeed.el("span", "", `${count} articles`))
  a.append(meta)

  li.append(a)
  return li
}
