// «Related reading» under blog posts (overrides/partials/comments.html): up to three other posts
// that share the most tags with this one, newest first on a tie; each row shows the date and title.
// The post's own tags come from the page, the other posts' tags from the JSON feed. Without shared tags the section stays hidden.
siteFeed.onPage(async () => {
  const section = document.querySelector(".related[hidden]")
  if (!section || section.dataset.loaded) return
  section.dataset.loaded = "1"

  const own = new Set([...document.querySelectorAll(".md-content .md-tags .md-tag")].map(a => a.textContent.trim()))
  if (!own.size) return

  let items
  try {
    items = await siteFeed.load()
  } catch {
    return // without the feed there is nothing to suggest
  }

  // The feed mixes categories into tags ("QA" next to "qa"); only this post's real tags count as a match
  const related = items
    .filter(item => siteFeed.isBlog(item) && item.path !== location.pathname)
    .map(item => ({ item, shared: (item.tags ?? []).filter(tag => own.has(tag)) }))
    .filter(({ shared }) => shared.length)
    .sort((a, b) => b.shared.length - a.shared.length || b.item.date - a.item.date)
    .slice(0, 3)
  if (!related.length) return

  const day = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })
  const list = section.querySelector(".related__list")
  for (const { item } of related) {
    const li = siteFeed.el("li")
    li.append(siteFeed.time(item, day), siteFeed.link(item))
    list.append(li)
  }
  section.hidden = false
})
