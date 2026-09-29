// «Copy link» button in the Share block (overrides/partials/share.html).
// One delegated listener, so it also works on pages loaded by navigation.instant.
document.addEventListener("click", async event => {
  const button = event.target.closest(".share__copy")
  if (!button) return

  try {
    await navigator.clipboard.writeText(location.href)
  } catch {
    // Clipboard API is missing (insecure context) or denied: fall back to a prompt the user can copy from
    window.prompt("Copy this link:", location.href)
    return
  }
  button.dataset.copied = ""
  button.title = "Copied!"
  setTimeout(() => {
    delete button.dataset.copied
    button.title = "Copy link"
  }, 1500)
})
