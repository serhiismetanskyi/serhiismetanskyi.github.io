// Смужка прогресу читання вгорі сторінки — лише на сторінках постів блогу
(() => {
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

  window.addEventListener("scroll", update, { passive: true })
  window.addEventListener("resize", update)

  // З navigation.instant сторінки змінюються без перезавантаження
  if (window.document$) document$.subscribe(update)
  else update()
})()
