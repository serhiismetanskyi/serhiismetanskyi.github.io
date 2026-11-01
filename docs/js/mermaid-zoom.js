// Click a Mermaid diagram to open it full screen: mouse wheel or pinch to zoom, drag to pan, double click to reset.
// The theme draws diagrams into a closed shadow root; overrides/main.html opens it for `.mermaid` hosts
// (before the theme script runs), so the rendered <svg> can be copied into the viewer.
const MIN_SCALE = 0.2
const MAX_SCALE = 8

let dialog = null

function openViewer(host) {
  const source = host.shadowRoot?.querySelector("svg")
  if (!source) return

  const box = source.viewBox.baseVal
  const width = box.width || source.getBoundingClientRect().width
  const height = box.height || source.getBoundingClientRect().height
  if (!width || !height) return

  const svg = source.cloneNode(true)
  svg.removeAttribute("style") // the id stays: the diagram's own <style> rules are scoped to it
  svg.setAttribute("width", width)
  svg.setAttribute("height", height)

  dialog?.remove()
  dialog = document.createElement("dialog")
  dialog.className = "mermaid-viewer"
  dialog.setAttribute("aria-label", "Diagram viewer")

  const stage = document.createElement("div")
  stage.className = "mermaid-viewer__stage"
  stage.append(svg)

  // Lucide icons (stroke paths) for the toolbar
  const icons = {
    minus: "M5 12h14",
    plus: "M5 12h14M12 5v14",
    reset: "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3",
    close: "M18 6 6 18M6 6l12 12",
  }
  const makeButton = (action, icon, title, label) => {
    const button = document.createElement("button")
    button.type = "button"
    button.dataset.action = action
    button.title = title
    button.setAttribute("aria-label", title)
    button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[icon]}"/></svg>`
    if (label) button.append(label)
    return button
  }

  const percent = document.createElement("span")
  percent.className = "mermaid-viewer__percent"
  percent.title = "Current zoom"

  const toolbar = document.createElement("div")
  toolbar.className = "mermaid-viewer__toolbar"
  toolbar.append(
    makeButton("zoom-out", "minus", "Zoom out (-)"),
    percent,
    makeButton("zoom-in", "plus", "Zoom in (+)"),
    makeButton("reset", "reset", "Back to the whole diagram (0)", "Reset view"),
    makeButton("close", "close", "Close (Esc)"),
  )

  const hint = document.createElement("p")
  hint.className = "mermaid-viewer__hint"
  hint.textContent = "Scroll to zoom \u00b7 Drag to move \u00b7 Double-click to reset \u00b7 Esc to close"

  const view = document.createElement("div")
  view.className = "mermaid-viewer__view"
  view.append(stage)
  dialog.append(view, toolbar, hint)
  document.body.append(dialog)

  let scale = 1
  let x = 0
  let y = 0

  const apply = () => {
    stage.style.transform = `translate(${x}px, ${y}px) scale(${scale})`
    percent.textContent = `${Math.round(scale * 100)}%`
  }

  const fit = () => {
    const rect = view.getBoundingClientRect()
    scale = Math.min((rect.width * 0.94) / width, (rect.height * 0.9) / height, 3)
    x = (rect.width - width * scale) / 2
    y = (rect.height - height * scale) / 2
    apply()
  }

  // Zoom around a point given in the view's coordinates, so the spot under the cursor stays put
  const zoomAt = (px, py, factor) => {
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale * factor))
    x = px - ((px - x) * next) / scale
    y = py - ((py - y) * next) / scale
    scale = next
    apply()
  }

  const center = () => {
    const rect = view.getBoundingClientRect()
    return [rect.width / 2, rect.height / 2]
  }

  view.addEventListener(
    "wheel",
    event => {
      event.preventDefault()
      const rect = view.getBoundingClientRect()
      zoomAt(event.clientX - rect.left, event.clientY - rect.top, Math.exp(-event.deltaY * 0.0015))
    },
    { passive: false },
  )

  // One pointer pans, two pointers pinch
  const pointers = new Map()
  let pinchDistance = 0

  view.addEventListener("pointerdown", event => {
    view.setPointerCapture(event.pointerId)
    pointers.set(event.pointerId, [event.clientX, event.clientY])
    pinchDistance = 0
    view.classList.add("is-dragging")
  })

  view.addEventListener("pointermove", event => {
    const previous = pointers.get(event.pointerId)
    if (!previous) return
    pointers.set(event.pointerId, [event.clientX, event.clientY])

    if (pointers.size === 1) {
      x += event.clientX - previous[0]
      y += event.clientY - previous[1]
      apply()
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()]
      const distance = Math.hypot(a[0] - b[0], a[1] - b[1])
      if (pinchDistance) {
        const rect = view.getBoundingClientRect()
        zoomAt((a[0] + b[0]) / 2 - rect.left, (a[1] + b[1]) / 2 - rect.top, distance / pinchDistance)
      }
      pinchDistance = distance
    }
  })

  const release = event => {
    pointers.delete(event.pointerId)
    pinchDistance = 0
    if (!pointers.size) view.classList.remove("is-dragging")
  }
  view.addEventListener("pointerup", release)
  view.addEventListener("pointercancel", release)
  view.addEventListener("dblclick", fit)

  toolbar.addEventListener("click", event => {
    const action = event.target.closest("button")?.dataset.action
    if (action === "zoom-in") zoomAt(...center(), 1.4)
    else if (action === "zoom-out") zoomAt(...center(), 1 / 1.4)
    else if (action === "reset") fit()
    else if (action === "close") dialog.close()
  })

  dialog.addEventListener("keydown", event => {
    if (event.key === "+" || event.key === "=") zoomAt(...center(), 1.4)
    else if (event.key === "-") zoomAt(...center(), 1 / 1.4)
    else if (event.key === "0") fit()
  })

  // A click on the dark backdrop (the dialog itself, outside the view) closes the viewer
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close()
  })
  dialog.addEventListener("close", () => {
    dialog?.remove()
    dialog = null
    host.focus({ preventScroll: true })
  })

  dialog.showModal()
  fit()
}

function enhance(host) {
  if (host.dataset.zoom || !host.shadowRoot) return
  host.dataset.zoom = ""
  host.tabIndex = 0
  host.setAttribute("role", "button")
  host.setAttribute("aria-label", "Open diagram full screen")
  host.title = "Click to zoom"
  host.addEventListener("click", () => openViewer(host))
  host.addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault()
      openViewer(host)
    }
  })
}

function scan(root) {
  if (root.matches?.("div.mermaid")) enhance(root)
  for (const host of root.querySelectorAll?.("div.mermaid") ?? []) enhance(host)
}

// Diagrams are drawn asynchronously and pages can be swapped by navigation.instant, so watch for new ones
new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) {
      if (node.nodeType === Node.ELEMENT_NODE) scan(node)
    }
  }
}).observe(document.body, { childList: true, subtree: true })

scan(document)
