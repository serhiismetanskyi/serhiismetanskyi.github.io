// Shared code for blocks built from the site's JSON feed (rss plugin):
// latest posts and docs on the home page (latest.js) and the /archive/ page (archive.js)
window.siteFeed = (() => {
  let cache = null

  // Site root: the header logo always links to the home page
  const root = () => new URL(document.querySelector(".md-header .md-logo")?.href ?? "/", location.href)

  // Feed titles may contain HTML entities (&amp;): turn them into plain text
  const decode = text => new DOMParser().parseFromString(text ?? "", "text/html").documentElement.textContent

  // Loads the feed once; after an error the next call tries again
  const load = (path = "feed_json_created.json") => {
    cache ??= fetch(new URL(path, root()))
      .then(res => {
        if (!res.ok) throw new Error(`Feed: HTTP ${res.status}`)
        return res.json()
      })
      .then(feed =>
        (feed.items ?? []).map(item => ({
          ...item,
          title: decode(item.title),
          date: new Date(item.date_published),
          path: new URL(item.url).pathname,
        })),
      )
      .catch(error => {
        cache = null
        throw error
      })
    return cache
  }

  // Element with a class and text: el("time", "archive-date", "Sep 25")
  const el = (tag, className = "", text = "") => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }

  // Link to a feed entry (relative path, works both locally and on the domain)
  const link = item => {
    const a = el("a", "", item.title)
    a.href = item.path
    return a
  }

  const time = (item, format) => {
    const node = el("time", "", format.format(item.date))
    node.dateTime = item.date_published
    return node
  }

  // Runs fn on every page, including navigation.instant transitions
  const onPage = fn => (window.document$ ? document$.subscribe(fn) : fn())

  return {
    load,
    el,
    link,
    time,
    onPage,
    isBlog: item => item.path.includes("/blog/"),
    isDocs: item => item.path.includes("/docs/"),
  }
})()
