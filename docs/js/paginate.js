// Page numbers for long static lists (elements with data-per-page: project cards, the projects' yearly archive).
// Same markup as the blog's pagination (.md-pagination), so both look alike. The page is kept in the URL (?page=2);
// without JS every item stays visible.
siteFeed.onPage(() => {
  for (const list of document.querySelectorAll("[data-per-page]:not([data-paged])")) {
    list.dataset.paged = "1"
    const items = [...list.children]
    const perPage = Number(list.dataset.perPage) || 10
    const pages = Math.ceil(items.length / perPage)
    if (pages < 2) continue

    const nav = siteFeed.el("nav", "md-pagination")
    nav.setAttribute("aria-label", "Pages")
    list.after(nav)

    const url = page => {
      const next = new URL(location.href)
      if (page > 1) next.searchParams.set("page", String(page))
      else next.searchParams.delete("page")
      return next
    }

    const link = (n, text, className = "", label = "") => {
      const a = siteFeed.el("a", `md-pagination__link ${className}`.trim(), text)
      a.href = url(n).href
      if (label) a.setAttribute("aria-label", label)
      a.addEventListener("click", event => {
        event.preventDefault()
        history.replaceState(null, "", url(n))
        show(n, true)
      })
      return a
    }

    const show = (page, scroll) => {
      for (const [i, item] of items.entries()) item.hidden = Math.floor(i / perPage) + 1 !== page
      const numbers = Array.from({ length: pages }, (_, i) => {
        const n = i + 1
        if (n !== page) return link(n, String(n))
        const current = siteFeed.el("span", "md-pagination__current", String(n))
        current.setAttribute("aria-current", "page")
        return current
      })
      nav.replaceChildren(
        ...(page > 1 ? [link(page - 1, "", "md-pagination__step md-pagination__step--prev", "Previous page")] : []),
        ...numbers,
        ...(page < pages ? [link(page + 1, "", "md-pagination__step md-pagination__step--next", "Next page")] : []),
      )
      if (scroll) list.scrollIntoView({ block: "start", behavior: "smooth" })
    }

    const requested = Number(new URLSearchParams(location.search).get("page"))
    show(Number.isInteger(requested) && requested >= 1 && requested <= pages ? requested : 1, false)
  }
})
