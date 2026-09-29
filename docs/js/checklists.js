// Tickable checklists (Markdown task lists `- [ ]`): ticks are saved in this browser per page,
// and every list gets a «N / M done · Reset» line. Storage may be unavailable (private mode) — then ticks just aren't kept.
siteFeed.onPage(() => {
  const lists = [...document.querySelectorAll(".md-content__inner ul.task-list")].filter(
    list => !list.parentElement.closest("ul.task-list") && !list.dataset.checklist,
  )
  if (!lists.length) return

  const key = `checklist:${location.pathname}`
  const load = () => {
    try {
      return JSON.parse(localStorage.getItem(key) ?? "{}")
    } catch {
      return {}
    }
  }
  const save = state => {
    try {
      if (Object.keys(state).length) localStorage.setItem(key, JSON.stringify(state))
      else localStorage.removeItem(key)
    } catch {
      // storage blocked: ticks stay for this visit only
    }
  }

  const state = load()

  lists.forEach((list, listIndex) => {
    list.dataset.checklist = "1"
    const boxes = [...list.querySelectorAll("input[type=checkbox]")]
    const initial = boxes.map(box => box.checked) // `- [x]` in the source starts ticked

    const progress = siteFeed.el("p", "checklist-progress")
    const count = siteFeed.el("span", "checklist-progress__count")
    const bar = siteFeed.el("span", "checklist-progress__bar")
    const fill = siteFeed.el("span", "checklist-progress__fill")
    bar.append(fill)
    const reset = siteFeed.el("button", "checklist-progress__reset", "Reset")
    reset.type = "button"
    progress.append(bar, count, reset)
    list.after(progress)

    const update = () => {
      const done = boxes.filter(box => box.checked).length
      count.textContent = `${done} / ${boxes.length} done`
      fill.style.width = `${(done / boxes.length) * 100}%`
      progress.classList.toggle("checklist-progress--complete", done === boxes.length)
      reset.hidden = boxes.every((box, i) => box.checked === initial[i])
      for (const box of boxes) box.closest("li").classList.toggle("task-list-item--done", box.checked)
    }

    boxes.forEach((box, i) => {
      const id = `${listIndex}:${i}`
      if (id in state) box.checked = state[id]
      box.addEventListener("change", () => {
        if (box.checked === initial[i]) delete state[id]
        else state[id] = box.checked
        save(state)
        update()
      })
    })

    reset.addEventListener("click", () => {
      boxes.forEach((box, i) => {
        box.checked = initial[i]
        delete state[`${listIndex}:${i}`]
      })
      save(state)
      update()
    })

    update()
  })
})
