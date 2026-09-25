// Сторінка /archive/: пости блогу й статті Docs, згруповані за місяцями, найновіші зверху
siteFeed.onPage(async () => {
  const box = document.querySelector(".archive-all")
  if (!box || box.dataset.loaded) return
  box.dataset.loaded = "1"

  const day = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" })
  const month = new Intl.DateTimeFormat("en", { month: "long", year: "numeric", timeZone: "UTC" })
  const monthKey = date => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`

  let items
  try {
    items = await siteFeed.load(box.dataset.feed)
  } catch {
    return  // без стрічки лишається посилання на блог з <noscript>
  }

  const months = new Map()
  for (const item of items) {
    const key = monthKey(item.date)
    if (!months.has(key)) months.set(key, [])
    months.get(key).push(item)
  }

  for (const [key, posts] of [...months].sort(([a], [b]) => b.localeCompare(a))) {
    const heading = siteFeed.el("h2", "", month.format(posts[0].date))
    heading.id = key
    heading.append(" ", siteFeed.el("span", "archive-count", String(posts.length)))

    const list = siteFeed.el("ul", "archive-list md-typeset")
    for (const post of posts.sort((a, b) => b.date - a.date)) {
      const docs = siteFeed.isDocs(post)
      const kind = siteFeed.el("span", docs ? "archive-kind archive-kind--docs" : "archive-kind", docs ? "Docs" : "Blog")
      const li = siteFeed.el("li")
      li.append(siteFeed.time(post, day), siteFeed.link(post), kind)
      list.append(li)
    }

    box.append(heading, list)
  }
})
