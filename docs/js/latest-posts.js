// Останні пости блогу на головній (блок .latest-posts у docs/index.md)
siteFeed.onPage(async () => {
  const box = document.querySelector(".latest-posts")
  if (!box || box.dataset.loaded) return
  box.dataset.loaded = "1"

  const format = new Intl.DateTimeFormat("en", { year: "numeric", month: "short", day: "numeric" })
  const limit = Number(box.dataset.limit) || 3
  const list = box.querySelector("ul")

  try {
    const posts = (await siteFeed.load(box.dataset.feed)).filter(siteFeed.isBlog)
    for (const post of posts.slice(0, limit)) {
      const li = siteFeed.el("li")
      li.append(siteFeed.time(post, format), siteFeed.link(post))
      list.append(li)
    }
  } catch {
    // без стрічки блок просто лишається прихованим
  }
  box.hidden = list.children.length === 0
})
