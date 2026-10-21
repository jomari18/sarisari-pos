// Runs before the page paints, so a saved light theme never flashes dark first. Dark is the default.
(function () {
  var theme = "dark";
  try {
    if (localStorage.getItem("sari-theme") === "light") theme = "light";
  } catch {
    // Storage blocked: keep the default.
  }
  document.documentElement.setAttribute("data-theme", theme);
})();
