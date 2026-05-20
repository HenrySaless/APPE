export function createToastManager() {
  let container = document.getElementById("toast-root");

  if (!container) {
    container = document.createElement("div");
    container.id = "toast-root";
    container.className = "toast-root";
    document.body.appendChild(container);
  }

  function show(message, type = "info") {
    const toast = document.createElement("div");
    toast.className = `toast toast-${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.add("show");
    });

    window.setTimeout(() => {
      toast.classList.remove("show");
      window.setTimeout(() => toast.remove(), 220);
    }, 3600);
  }

  return {
    error(message) {
      show(message, "error");
    },
    info(message) {
      show(message, "info");
    },
    success(message) {
      show(message, "success");
    },
  };
}
