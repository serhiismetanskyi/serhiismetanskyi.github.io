// «Tags» section in the left menu, under Archive and Categories: a cloud of tags linking to the /tags/ page
// filtered to that tag and section (?tag=pytest&type=blog). Two places:
// - blog: every tag used in blog posts (from the JSON feed);
// - projects: every project tag (from #project-tags, written by main.html from zensical.toml).
const tagCloud = (counts, type, noun) => {
  const section = siteFeed.el("li", "md-nav__item md-nav__item--section blog-tags")
  const title = siteFeed.el("span", "md-nav__link blog-tags__title")
  title.append(siteFeed.el("span", "md-ellipsis", "Tags"))

  const cloud = siteFeed.el("nav", "md-tags md-typeset blog-tags__cloud")
  cloud.setAttribute("aria-label", `${type === "blog" ? "Blog" : "Project"} tags`)
  const tagsPage = new URL("tags/", document.querySelector(".md-header .md-logo")?.href ?? location.href)
  for (const [tag, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) {
    const a = siteFeed.el("a", "md-tag", tag)
    a.href = `${tagsPage.pathname}?${new URLSearchParams({ tag, type })}`
    a.title = `${count} ${noun}${count === 1 ? "" : "s"}`
    cloud.append(a)
  }
  section.append(title, cloud)
  return section
}

const countTags = tags => {
  const counts = new Map()
  for (const tag of tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  return counts
}

siteFeed.onPage(async () => {
  const menu = document.querySelector(".md-sidebar--primary")
  if (!menu || menu.querySelector(".blog-tags")) return

  // «Categories» of the current section (Blog or Projects); the other section's menu is in the page too, collapsed
  const section = menu.querySelector(".md-nav--primary > ul > .md-nav__item--active")
  const labels = [...(section?.querySelectorAll("label.md-nav__link") ?? [])]
  const categories = labels.find(label => label.textContent.trim() === "Categories")?.closest(".md-nav__item")
  if (!categories) return

  // Projects
  const data = document.getElementById("project-tags")
  if (data) {
    let tags = []
    try {
      tags = JSON.parse(data.textContent).flat()
    } catch {
      return
    }
    if (tags.length) categories.after(tagCloud(countTags(tags), "projects", "project"))
    return
  }

  // Blog
  let items
  try {
    items = await siteFeed.load()
  } catch {
    return // without the feed the menu stays as the theme built it
  }

  // The feed lists categories among the tags ("QA" next to "qa"), so the names from the menu are left out
  const names = new Set([...categories.querySelectorAll("a .md-ellipsis")].map(span => span.textContent.trim()))
  const counts = countTags(
    items
      .filter(siteFeed.isBlog)
      .flatMap(item => item.tags ?? [])
      .filter(tag => !names.has(tag)),
  )
  if (!counts.size || categories.parentElement.querySelector(".blog-tags")) return
  categories.after(tagCloud(counts, "blog", "post"))
})
