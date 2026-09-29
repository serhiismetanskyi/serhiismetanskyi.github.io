// Reading progress bar at the top of the page, only on blog post pages
;(() => {
  const bar = document.createElement("div")
  bar.className = "reading-progress"
  bar.hidden = true
  document.body.append(bar)

  const update = () => {
    const post = document.querySelector(".md-content--post .md-content__inner")
    bar.hidden = !post
    if (!post) return
    const total = post.offsetHeight - window.innerHeight
    const read = -post.getBoundingClientRect().top
    const progress = total > 0 ? Math.min(1, Math.max(0, read / total)) : 1
    bar.style.transform = `scaleX(${progress})`
  }

  let frame = 0
  const schedule = () => {
    if (frame) return
    frame = requestAnimationFrame(() => {
      frame = 0
      update()
    })
  }

  window.addEventListener("scroll", schedule, { passive: true })
  window.addEventListener("resize", schedule)

  // With navigation.instant, pages change without a reload
  if (window.document$) document$.subscribe(update)
  else update()
})()
