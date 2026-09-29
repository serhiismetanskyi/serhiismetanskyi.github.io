// Hamburger button for the footer's page links on mobile (overrides/partials/footer.html).
// The button ships hidden, so without JS the links stay visible; CSS collapses them only while the button is shown.
siteFeed.onPage(() => {
  for (const button of document.querySelectorAll(".site-footer__menu-button[hidden]")) {
    button.hidden = false
  }
})

// One listener for all pages: navigation.instant swaps the footer, the document stays
document.addEventListener("click", event => {
  const button = event.target.closest(".site-footer__menu-button")
  if (!button) return
  const open = button.getAttribute("aria-expanded") !== "true"
  button.setAttribute("aria-expanded", String(open))
  button.setAttribute("aria-label", open ? "Close menu" : "Menu")
})
