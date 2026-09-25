// Спільне для блоків, що будуються з JSON-стрічки сайту (плагін rss):
// останні пости на головній (latest-posts.js) і сторінка /archive/ (archive.js)
window.siteFeed = (() => {
  let cache = null

  // Корінь сайту: логотип у шапці завжди веде на головну
  const root = () => new URL(document.querySelector(".md-header .md-logo")?.href ?? "/", location.href)

  // Завантажує стрічку один раз; при помилці наступний виклик спробує знову
  const load = (path = "feed_json_created.json") => {
    cache ??= fetch(new URL(path, root()))
      .then(res => {
        if (!res.ok) throw new Error(`Feed: HTTP ${res.status}`)
        return res.json()
      })
      .then(feed => (feed.items ?? []).map(item => ({
        ...item,
        date: new Date(item.date_published),
        path: new URL(item.url).pathname,
      })))
      .catch(error => {
        cache = null
        throw error
      })
    return cache
  }

  // Елемент з класом і текстом: el("time", "archive-date", "Sep 25")
  const el = (tag, className = "", text = "") => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text) node.textContent = text
    return node
  }

  // Посилання на запис стрічки (відносний шлях — працює і локально, і на домені)
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

  // Запускає fn на кожній сторінці, зокрема при переходах navigation.instant
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
